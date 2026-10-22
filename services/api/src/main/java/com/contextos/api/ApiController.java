package com.contextos.api;

import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
@CrossOrigin(origins = "http://localhost:5173")
public class ApiController {
    private final JdbcTemplate db;
    private final RabbitTemplate rabbit;
    private final RestClient ai;
    private final Path storage;
    private final long maxBytes;
    private final TransactionTemplate transaction;
    private final ObjectMapper objectMapper;

    public ApiController(JdbcTemplate db, RabbitTemplate rabbit, PlatformTransactionManager transactionManager, ObjectMapper objectMapper,
            @Value("${contextos.ai-base-url}") String aiUrl,
            @Value("${contextos.ai-service-token}") String aiToken,
            @Value("${contextos.storage}") String storage,
            @Value("${contextos.max-upload-bytes}") long maxBytes) throws Exception {
        this.db = db; this.rabbit = rabbit;
        var requestFactory=new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(3)); requestFactory.setReadTimeout(Duration.ofSeconds(35));
        this.ai = RestClient.builder().baseUrl(aiUrl).requestFactory(requestFactory).defaultHeader("X-Service-Token", aiToken).build();
        this.storage = Paths.get(storage).toAbsolutePath().normalize(); this.maxBytes = maxBytes;
        this.transaction = new TransactionTemplate(transactionManager);
        this.objectMapper = objectMapper;
        Files.createDirectories(this.storage);
    }

    private UUID user(String userId) {
        UUID id;
        try { id = UUID.fromString(userId); } catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-User-Id must be a UUID"); }
        db.update("INSERT INTO users(id,email,display_name) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING", id, id + "@local.test", "Demo user");
        return id;
    }
    private void requireMember(UUID workspace, UUID user) {
        Integer n = db.queryForObject("SELECT count(*) FROM workspace_members WHERE workspace_id=? AND user_id=?", Integer.class, workspace, user);
        if (n == null || n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workspace not found");
    }

    @PostMapping("/workspaces")
    public Map<String,Object> createWorkspace(@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header, @RequestBody Map<String,String> body) {
        UUID u=user(header), w=UUID.randomUUID(); String name=Optional.ofNullable(body.get("name")).orElse("My workspace").trim();
        if (name.isBlank() || name.length()>120) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Workspace name is required (max 120 characters)");
        db.update("INSERT INTO workspaces(id,name,created_by) VALUES (?,?,?)",w,name,u);
        db.update("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?, 'ADMIN')",w,u);
        return Map.of("id",w,"name",name,"role","ADMIN");
    }

    @GetMapping("/workspaces")
    public List<Map<String,Object>> workspaces(@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header) {
        return db.queryForList("SELECT w.id,w.name,m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.created_at",user(header));
    }

    @PostMapping(value="/workspaces/{workspace}/documents", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String,Object> upload(@PathVariable UUID workspace, @RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header, @RequestPart("file") MultipartFile file) throws Exception {
        UUID u=user(header); requireMember(workspace,u);
        if (file.isEmpty() || file.getSize()>maxBytes) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"File is empty or exceeds upload limit");
        String original=Paths.get(Optional.ofNullable(file.getOriginalFilename()).orElse("upload.md")).getFileName().toString();
        String lower=original.toLowerCase(Locale.ROOT);
        if (!(lower.endsWith(".pdf")||lower.endsWith(".docx")||lower.endsWith(".md")||lower.endsWith(".markdown"))) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"Supported formats: PDF, DOCX, Markdown");
        byte[] bytes=file.getBytes(); String checksum=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        if(lower.endsWith(".pdf") && (bytes.length<5 || !new String(bytes,0,5,java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"))) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"The file contents do not match a PDF");
        if(lower.endsWith(".docx") && (bytes.length<4 || bytes[0]!='P' || bytes[1]!='K')) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"The file contents do not match a DOCX archive");
        var duplicates=db.query("SELECT id,filename,status FROM documents WHERE workspace_id=? AND checksum=? ORDER BY created_at DESC LIMIT 1",(rs,n)->Map.<String,Object>of("id",rs.getObject("id",UUID.class),"filename",rs.getString("filename"),"status",rs.getString("status")),workspace,checksum);
        if(!duplicates.isEmpty()) return Map.of("id",duplicates.get(0).get("id"),"filename",duplicates.get(0).get("filename"),"status",duplicates.get(0).get("status"),"duplicate",true);
        UUID id=UUID.randomUUID(), job=UUID.randomUUID(); String key=id.toString()+"-"+original.replaceAll("[^A-Za-z0-9._-]","_");
        Path target=storage.resolve(key).normalize(); Path staging=Files.createTempFile(storage,id.toString(),".upload");
        try {
            Files.write(staging,bytes,StandardOpenOption.WRITE,StandardOpenOption.TRUNCATE_EXISTING);
            try { Files.move(staging,target,StandardCopyOption.ATOMIC_MOVE); }
            catch(AtomicMoveNotSupportedException e) { Files.move(staging,target); }
            try {
                transaction.executeWithoutResult(status -> {
                    db.update("INSERT INTO documents(id,workspace_id,uploaded_by,filename,content_type,storage_key,checksum,status) VALUES (?,?,?,?,?,?,?,'QUEUED')",id,workspace,u,original,Optional.ofNullable(file.getContentType()).orElse("application/octet-stream"),key,checksum);
                    db.update("INSERT INTO ingestion_jobs(id,document_id,status,idempotency_key) VALUES (?,?,'QUEUED',?)",job,id,checksum+":"+id);
                });
            } catch(Exception e) { Files.deleteIfExists(target); throw e; }
        } finally { Files.deleteIfExists(staging); }
        rabbit.convertAndSend("contextos.ingestion",id.toString());
        return Map.of("id",id,"filename",original,"status","QUEUED","duplicate",false);
    }

    @GetMapping("/workspaces/{workspace}/documents")
    public List<Map<String,Object>> documents(@PathVariable UUID workspace,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header) {
        requireMember(workspace,user(header));
        return db.queryForList("SELECT id,filename,status,created_at,failure_code FROM documents WHERE workspace_id=? ORDER BY created_at DESC",workspace);
    }

    @DeleteMapping("/documents/{id}")
    public Map<String,Object> delete(@PathVariable UUID id,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header) {
        UUID u=user(header);
        var rows=db.query("SELECT workspace_id,storage_key FROM documents WHERE id=?",(rs,n)->Map.of("workspace",rs.getObject(1,UUID.class),"key",rs.getString(2)),id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        UUID workspace=(UUID)rows.get(0).get("workspace"); requireMember(workspace,u);
        try { Files.deleteIfExists(storage.resolve((String)rows.get(0).get("key")).normalize()); }
        catch(Exception e) { throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,"Could not remove document file"); }
        db.update("DELETE FROM documents WHERE id=?",id);
        return Map.of("deleted",true);
    }

    @PostMapping("/documents/{id}/retry")
    public Map<String,Object> retry(@PathVariable UUID id,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header) {
        UUID u=user(header);
        var rows=db.query("SELECT d.workspace_id,d.status,j.attempt_count FROM documents d JOIN ingestion_jobs j ON j.document_id=d.id WHERE d.id=?",(rs,n)->Map.of("workspace",rs.getObject(1,UUID.class),"status",rs.getString(2),"attempts",rs.getInt(3)),id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        requireMember((UUID)rows.get(0).get("workspace"),u);
        if(!"FAILED".equals(rows.get(0).get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Only failed documents can be retried");
        if((Integer)rows.get(0).get("attempts")>=3) throw new ResponseStatusException(HttpStatus.CONFLICT,"Retry limit reached");
        int updated=db.update("UPDATE documents SET status='QUEUED',failure_code=NULL,updated_at=now() WHERE id=? AND status='FAILED'",id);
        if(updated==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Document status changed; refresh and try again");
        db.update("UPDATE ingestion_jobs SET status='QUEUED' WHERE document_id=?",id);
        rabbit.convertAndSend("contextos.ingestion",id.toString());
        return Map.of("id",id,"status","QUEUED");
    }

    @PostMapping("/workspaces/{workspace}/ask")
    public Map<String,Object> ask(@PathVariable UUID workspace,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header,@RequestBody Map<String,String> body) {
        requireMember(workspace,user(header)); String question=Optional.ofNullable(body.get("question")).orElse("").trim();
        if(question.isBlank()||question.length()>4000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Question must be 1 to 4000 characters");
        return generateAnswer(workspace,question);
    }

    @PostMapping("/workspaces/{workspace}/conversations")
    public Map<String,Object> createConversation(@PathVariable UUID workspace,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header,@RequestBody(required=false) Map<String,String> body) {
        UUID actor=user(header); requireMember(workspace,actor);
        String title=body==null?"New conversation":Optional.ofNullable(body.get("title")).orElse("New conversation").trim();
        if(title.isBlank()) title="New conversation";
        title=title.substring(0,Math.min(title.length(),120));
        UUID id=UUID.randomUUID();
        db.update("INSERT INTO conversations(id,workspace_id,created_by,title) VALUES (?,?,?,?)",id,workspace,actor,title);
        return Map.of("id",id,"title",title);
    }

    @GetMapping("/workspaces/{workspace}/conversations")
    public List<Map<String,Object>> conversations(@PathVariable UUID workspace,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header) {
        requireMember(workspace,user(header));
        return db.queryForList("SELECT c.id,c.title,c.updated_at,(SELECT m.content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message FROM conversations c WHERE c.workspace_id=? ORDER BY c.updated_at DESC LIMIT 50",workspace);
    }

    @GetMapping("/conversations/{conversation}/messages")
    public List<Map<String,Object>> messages(@PathVariable UUID conversation,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header) {
        UUID actor=user(header), workspace=conversationWorkspace(conversation); requireMember(workspace,actor);
        return db.query("SELECT m.id,m.role,m.content,m.metadata::text,m.created_at,f.rating FROM messages m LEFT JOIN feedback f ON f.message_id=m.id AND f.user_id=? WHERE m.conversation_id=? ORDER BY m.sequence_no",(rs,n)->{
            Map<String,Object> message=new LinkedHashMap<>(); message.put("id",rs.getObject("id",UUID.class)); message.put("role",rs.getString("role")); message.put("content",rs.getString("content"));
            try { message.put("metadata",objectMapper.readValue(rs.getString(4),new TypeReference<Map<String,Object>>(){})); }
            catch(Exception e) { message.put("metadata",Map.of()); }
            message.put("createdAt",rs.getTimestamp("created_at").toInstant()); message.put("rating",rs.getObject("rating",Integer.class)); return message;
        },actor,conversation);
    }

    @PostMapping("/conversations/{conversation}/messages")
    public Map<String,Object> askConversation(@PathVariable UUID conversation,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header,@RequestBody Map<String,String> body) {
        UUID actor=user(header), workspace=conversationWorkspace(conversation); requireMember(workspace,actor);
        String question=Optional.ofNullable(body.get("question")).orElse("").trim();
        if(question.isBlank()||question.length()>4000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Question must be 1 to 4000 characters");
        Map<String,Object> result=generateAnswer(workspace,question);
        UUID userMessage=UUID.randomUUID(), assistantMessage=UUID.randomUUID();
        Map<String,Object> metadata=new LinkedHashMap<>(); metadata.put("citations",result.getOrDefault("citations",List.of())); metadata.put("model",result.get("model")); metadata.put("usage",result.get("usage")); metadata.put("latencyMs",result.get("latencyMs"));
        String metadataJson;
        try { metadataJson=objectMapper.writeValueAsString(metadata); } catch(Exception e) { throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,"Could not save answer metadata"); }
        String title=question.substring(0,Math.min(question.length(),80));
        transaction.executeWithoutResult(status->{
            db.update("INSERT INTO messages(id,conversation_id,role,content,metadata) VALUES (?,?,'USER',?,'{}'::jsonb)",userMessage,conversation,question);
            db.update("INSERT INTO messages(id,conversation_id,role,content,metadata) VALUES (?,?,'ASSISTANT',?,?::jsonb)",assistantMessage,conversation,result.get("answer"),metadataJson);
            db.update("UPDATE conversations SET title=CASE WHEN title='New conversation' THEN ? ELSE title END,updated_at=now() WHERE id=?",title,conversation);
        });
        return Map.of("userMessage",Map.of("id",userMessage,"role","USER","content",question),"assistantMessage",Map.of("id",assistantMessage,"role","ASSISTANT","content",result.get("answer"),"metadata",metadata));
    }

    @PostMapping("/messages/{message}/feedback")
    public Map<String,Object> feedback(@PathVariable UUID message,@RequestHeader(value="X-User-Id", defaultValue="00000000-0000-0000-0000-000000000001") String header,@RequestBody Map<String,Object> body) {
        UUID actor=user(header), workspace=messageWorkspace(message); requireMember(workspace,actor);
        Object rawRating=body.get("rating");
        if(!(rawRating instanceof Number number)||number.doubleValue()!=number.intValue()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Rating must be an integer from 1 to 5");
        int rating=number.intValue();
        if(rating<1||rating>5) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Rating must be an integer from 1 to 5");
        String comment=Optional.ofNullable(body.get("comment")).map(Object::toString).orElse("").trim();
        if(comment.length()>1000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Feedback comment must be at most 1000 characters");
        db.update("INSERT INTO feedback(id,message_id,user_id,rating,comment) VALUES (?,?,?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,created_at=now()",UUID.randomUUID(),message,actor,rating,comment.isEmpty()?null:comment);
        return Map.of("saved",true,"rating",rating);
    }

    private UUID conversationWorkspace(UUID conversation) {
        var rows=db.query("SELECT workspace_id FROM conversations WHERE id=?",(rs,n)->rs.getObject(1,UUID.class),conversation);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Conversation not found");
        return rows.get(0);
    }
    private UUID messageWorkspace(UUID message) {
        var rows=db.query("SELECT c.workspace_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND m.role='ASSISTANT'",(rs,n)->rs.getObject(1,UUID.class),message);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Message not found");
        return rows.get(0);
    }

    private Map<String,Object> generateAnswer(UUID workspace,String question) {
        // Scope the database query before forwarding any document text to the AI service.
        var chunks=db.query("SELECT c.id,c.document_id,d.filename,c.content,c.page_number FROM document_chunks c JOIN documents d ON d.id=c.document_id WHERE c.workspace_id=? AND d.status='READY' AND to_tsvector('simple',c.content) @@ plainto_tsquery('simple',?) ORDER BY ts_rank(to_tsvector('simple',c.content),plainto_tsquery('simple',?)) DESC,c.chunk_index LIMIT 100",(rs,n)->Map.<String,Object>of("chunkId",rs.getString("id"),"documentId",rs.getString("document_id"),"filename",rs.getString("filename"),"content",rs.getString("content"),"page",rs.getObject("page_number") == null ? 0 : rs.getInt("page_number")),workspace,question,question);
        Map result;
        try { result=ai.post().uri("/answer").contentType(MediaType.APPLICATION_JSON).body(Map.of("question",question,"passages",chunks)).retrieve().body(Map.class); }
        catch(RestClientException e) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"AI service is unavailable"); }
        if(result==null) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"AI service returned no answer");
        return result;
    }
}
