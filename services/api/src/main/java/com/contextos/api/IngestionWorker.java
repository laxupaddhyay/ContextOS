package com.contextos.api;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class IngestionWorker {
    private final JdbcTemplate db; private final Path storage;
    public IngestionWorker(JdbcTemplate db,@Value("${contextos.storage}") String storage){this.db=db;this.storage=Paths.get(storage).toAbsolutePath().normalize();}
    @Bean Queue ingestionQueue(){return new Queue("contextos.ingestion",true);}
    @RabbitListener(queues="contextos.ingestion")
    public void process(String documentId){
        UUID id;
        try{id=UUID.fromString(documentId);}catch(Exception e){return;}
        var rows=db.query("SELECT storage_key,filename,workspace_id FROM documents WHERE id=? AND status IN ('QUEUED','FAILED')",(rs,n)->Map.of("key",rs.getString(1),"name",rs.getString(2),"workspace",rs.getObject(3,UUID.class)),id);
        if(rows.isEmpty())return;
        try{
            db.update("UPDATE documents SET status='PROCESSING',failure_code=NULL,updated_at=now() WHERE id=?",id);
            Map<String,Object> row=rows.get(0); Path path=storage.resolve((String)row.get("key")).normalize();
            if(!path.startsWith(storage))throw new IOException("invalid storage key");
            String name=(String)row.get("name"), text;
            if(name.toLowerCase(Locale.ROOT).endsWith(".pdf")){try(var pdf=Loader.loadPDF(path.toFile())){text=new PDFTextStripper().getText(pdf);}}
            else if(name.toLowerCase(Locale.ROOT).endsWith(".docx")){try(var in=Files.newInputStream(path);var doc=new XWPFDocument(in)){text=String.join("\n",doc.getParagraphs().stream().map(p->p.getText()).toList());}}
            else text=Files.readString(path);
            text=text.replaceAll("[\\t ]+"," ").replaceAll("\\n{3,}","\n\n").trim();
            if(text.isBlank())throw new IOException("empty document text");
            db.update("DELETE FROM document_chunks WHERE document_id=?",id);
            List<String> parts=split(text,2400); UUID workspace=(UUID)row.get("workspace"); int i=0;
            for(String part:parts)db.update("INSERT INTO document_chunks(id,document_id,workspace_id,chunk_index,content) VALUES (?,?,?,?,?)",UUID.randomUUID(),id,workspace,i++,part);
            db.update("UPDATE documents SET status='READY',updated_at=now() WHERE id=?",id);
            db.update("UPDATE ingestion_jobs SET status='SUCCEEDED',attempt_count=attempt_count+1 WHERE document_id=?",id);
        }catch(Exception e){
            db.update("UPDATE documents SET status='FAILED',failure_code='EXTRACTION_FAILED',updated_at=now() WHERE id=?",id);
            db.update("UPDATE ingestion_jobs SET status='FAILED',attempt_count=attempt_count+1 WHERE document_id=?",id);
        }
    }
    private List<String> split(String text,int max){List<String> out=new ArrayList<>();for(int start=0;start<text.length();){int end=Math.min(start+max,text.length());if(end<text.length()){int boundary=text.lastIndexOf(' ',end);if(boundary>start+max/2)end=boundary;}out.add(text.substring(start,end).trim());start=end;}return out;}
}
