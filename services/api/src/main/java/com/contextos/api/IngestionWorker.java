package com.contextos.api;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class IngestionWorker {
    private static final Logger log = LoggerFactory.getLogger(IngestionWorker.class);
    private final JdbcTemplate db; private final Path storage;
    public IngestionWorker(JdbcTemplate db,@Value("${contextos.storage}") String storage){this.db=db;this.storage=Paths.get(storage).toAbsolutePath().normalize();}
    @Bean Queue ingestionQueue(){return new Queue("contextos.ingestion",true);}
    @Scheduled(fixedDelay=30000)
    public void recoverStalledJobs(){
        db.update("UPDATE documents d SET status='FAILED',failure_code='RETRY_LIMIT',updated_at=now() FROM ingestion_jobs j WHERE j.document_id=d.id AND j.attempt_count>=3 AND d.status IN ('QUEUED','PROCESSING') AND d.updated_at < now() - interval '30 minutes'");
        var stale=db.query("SELECT id FROM documents WHERE (status='QUEUED' AND updated_at < now() - interval '30 seconds') OR (status='PROCESSING' AND updated_at < now() - interval '30 minutes') ORDER BY created_at LIMIT 20",(rs,n)->rs.getObject(1,UUID.class));
        stale.forEach(id->process(id.toString()));
    }
    @RabbitListener(queues="contextos.ingestion")
    public void process(String documentId){
        UUID id;
        try{id=UUID.fromString(documentId);}catch(Exception e){return;}
        int claimed=db.update("UPDATE documents SET status='PROCESSING',failure_code=NULL,updated_at=now() WHERE id=? AND EXISTS (SELECT 1 FROM ingestion_jobs j WHERE j.document_id=documents.id AND j.attempt_count<3) AND (status IN ('QUEUED','FAILED') OR (status='PROCESSING' AND updated_at < now() - interval '30 minutes'))",id);
        if(claimed==0)return;
        var rows=db.query("SELECT storage_key,filename,workspace_id FROM documents WHERE id=? AND status='PROCESSING'",(rs,n)->Map.<String,Object>of("key",rs.getString(1),"name",rs.getString(2),"workspace",rs.getObject(3,UUID.class)),id);
        if(rows.isEmpty())return;
        try{
            db.update("UPDATE ingestion_jobs SET status='PROCESSING',attempt_count=attempt_count+1 WHERE document_id=?",id);
            Map<String,Object> row=rows.get(0); Path path=storage.resolve((String)row.get("key")).normalize();
            if(!path.startsWith(storage))throw new IOException("invalid storage key");
            String name=(String)row.get("name"); List<Chunk> chunks=new ArrayList<>();
            if(name.toLowerCase(Locale.ROOT).endsWith(".pdf")){
                try(var pdf=Loader.loadPDF(path.toFile())){
                    PDFTextStripper stripper=new PDFTextStripper();
                    for(int page=1;page<=pdf.getNumberOfPages();page++){
                        stripper.setStartPage(page);stripper.setEndPage(page);
                        addChunks(chunks,stripper.getText(pdf),page);
                    }
                }
            } else if(name.toLowerCase(Locale.ROOT).endsWith(".docx")){
                try(var in=Files.newInputStream(path);var doc=new XWPFDocument(in)){
                    addChunks(chunks,String.join("\n",doc.getParagraphs().stream().map(p->p.getText()).toList()),null);
                }
            } else addChunks(chunks,Files.readString(path),null);
            if(chunks.isEmpty())throw new IOException("empty document text");
            db.update("DELETE FROM document_chunks WHERE document_id=?",id);
            UUID workspace=(UUID)row.get("workspace"); int i=0;
            for(Chunk chunk:chunks)db.update("INSERT INTO document_chunks(id,document_id,workspace_id,chunk_index,content,page_number) VALUES (?,?,?,?,?,?)",UUID.randomUUID(),id,workspace,i++,chunk.content(),chunk.page());
            db.update("UPDATE documents SET status='READY',updated_at=now() WHERE id=?",id);
            db.update("UPDATE ingestion_jobs SET status='SUCCEEDED' WHERE document_id=?",id);
        }catch(Exception e){
            db.update("UPDATE documents SET status='FAILED',failure_code='EXTRACTION_FAILED',updated_at=now() WHERE id=?",id);
            db.update("UPDATE ingestion_jobs SET status='FAILED' WHERE document_id=?",id);
            log.warn("Ingestion failed for document {} ({})",id,e.getClass().getSimpleName());
        }
    }
    private record Chunk(String content,Integer page){}
    private void addChunks(List<Chunk> chunks,String raw,Integer page){
        String text=raw.replaceAll("[\\t ]+"," ").replaceAll("\\n{3,}","\n\n").trim();
        int max=2400, overlap=240;
        for(int start=0;start<text.length();){
            int end=Math.min(start+max,text.length());
            if(end<text.length()){int boundary=text.lastIndexOf(' ',end);if(boundary>start+max/2)end=boundary;}
            String part=text.substring(start,end).trim();
            if(!part.isEmpty())chunks.add(new Chunk(part,page));
            if(end>=text.length())break;
            int next=Math.max(start+1,end-overlap);
            while(next<end&&Character.isWhitespace(text.charAt(next)))next++;
            start=next;
        }
    }
}
