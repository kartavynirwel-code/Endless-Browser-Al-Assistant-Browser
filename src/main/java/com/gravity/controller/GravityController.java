package com.gravity.controller;

import com.gravity.service.ChatService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/gravity")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class GravityController {

    private final ChatService chatService;

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody ChatRequest request) {
        if (request == null || request.getMessage() == null || request.getMessage().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("reply", "Please provide a message."));
        }
        String reply = chatService.chat(request.getMessage(), request.getImage());
        return ResponseEntity.ok(Map.of("reply", reply));
    }

    @GetMapping("/status")
    public ResponseEntity<?> getStatus() {
        return ResponseEntity.ok(Map.of(
            "status", "idle"
        ));
    }

    @Data
    public static class ChatRequest {
        private String message;
        private String image;
    }
}
