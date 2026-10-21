package com.contextos.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ContextOsApplication {
    public static void main(String[] args) { SpringApplication.run(ContextOsApplication.class, args); }
}
