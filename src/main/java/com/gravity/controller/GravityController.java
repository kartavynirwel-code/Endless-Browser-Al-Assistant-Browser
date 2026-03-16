package com.gravity.controller;

import com.gravity.model.ChatMessage;
import com.gravity.model.ChatMessageRepository;
import com.gravity.model.User;
import com.gravity.model.UserRepository;
import com.gravity.service.ChatService;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import reactor.core.publisher.Flux;

import java.util.Collections;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/gravity")
@CrossOrigin(origins = "*")
public class GravityController {

    private final ChatService chatService;

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    @Autowired
    private UserRepository userRepository;

    public GravityController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody ChatRequest request) {
        if (request == null || request.getMessage() == null) {
            return ResponseEntity.badRequest().body(Map.of("reply", "Please provide a message."));
        }
        String sessionId = request.getSessionId() != null ? request.getSessionId() : "default-session";
        String reply = chatService.chat(sessionId, request.getMessage(), request.getImage());
        return ResponseEntity.ok(Map.of("reply", reply));
    }

    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatStream(@RequestBody ChatRequest request) {
        if (request == null || request.getMessage() == null) {
            return Flux.just("Error: Please provide a message.");
        }
        String sessionId = request.getSessionId() != null ? request.getSessionId() : "default-session";
        return chatService.streamChat(sessionId, request.getMessage(), request.getImage());
    }

    @GetMapping("/history")
    public ResponseEntity<?> getHistory() {
        try {
            Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
            if (principal instanceof UserDetails) {
                String username = ((UserDetails) principal).getUsername();
                User user = userRepository.findByUsername(username).orElse(null);
                if (user != null) {
                    List<ChatMessage> history = chatMessageRepository.findByUserIdOrderByTimestampAsc(user.getId());
                    return ResponseEntity.ok(history);
                }
            }
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("message", "Error fetching history: " + e.getMessage()));
        }
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
        private String sessionId;
    }
}
