package com.contextos.api;

import java.io.IOException;
import java.util.List;
import java.util.UUID;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class LocalIdentityHeaderFilter extends OncePerRequestFilter {
    private static final String DEFAULT_DEMO_USER = "00000000-0000-0000-0000-000000000001";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String value = request.getHeader("X-User-Id");
        if (value == null || value.isBlank()) value = DEFAULT_DEMO_USER;
        String userId;
        try {
            userId = UUID.fromString(value).toString();
        } catch (IllegalArgumentException e) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "X-User-Id must be a UUID in the local profile");
            return;
        }
        var authentication = UsernamePasswordAuthenticationToken.authenticated(
                userId, "local-demo", List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        chain.doFilter(request, response);
    }
}
