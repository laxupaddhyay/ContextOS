package com.contextos.api;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdentityService {
    private final JdbcTemplate db;

    public IdentityService(JdbcTemplate db) {
        this.db = db;
    }

    @Transactional
    public UUID resolveLocal(UUID id) {
        db.update("INSERT INTO users(id,email,display_name) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING",
                id, id + "@local.test", "Demo user");
        return id;
    }

    @Transactional
    public UUID resolveOidc(String issuer, String subject, String displayName) {
        if (issuer == null || issuer.isBlank() || subject == null || subject.isBlank()) {
            throw new IllegalArgumentException("Validated OIDC issuer and subject claims are required");
        }
        UUID id = UUID.nameUUIDFromBytes((issuer + "\u0000" + subject).getBytes(StandardCharsets.UTF_8));
        String name = displayName == null || displayName.isBlank() ? "OIDC user" : displayName.trim();
        db.update("INSERT INTO users(id,email,display_name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name",
                id, id + "@identity.contextos.invalid", name);
        db.update("INSERT INTO user_identities(issuer,subject,user_id) VALUES (?,?,?) ON CONFLICT(issuer,subject) DO UPDATE SET user_id=EXCLUDED.user_id",
                issuer, subject, id);
        return id;
    }
}
