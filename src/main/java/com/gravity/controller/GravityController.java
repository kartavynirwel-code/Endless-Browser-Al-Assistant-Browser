package com.gravity.controller;

import com.gravity.model.ChatMessage;
import com.gravity.model.ChatMessageRepository;
import com.gravity.model.User;
import com.gravity.model.UserRepository;
import com.gravity.service.AutomationOrchestrator;
import com.gravity.service.ChatService;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import reactor.core.publisher.Flux;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
@RequestMapping("/api/gravity")
@CrossOrigin(origins = "*")
public class GravityController {

    private final ChatService chatService;
    private final AutomationOrchestrator orchestrator;

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    @Autowired
    private UserRepository userRepository;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public GravityController(ChatService chatService, AutomationOrchestrator orchestrator) {
        this.chatService = chatService;
        this.orchestrator = orchestrator;
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
    public Flux<Map<String, String>> chatStream(@RequestBody ChatRequest request) {
        if (request == null || request.getMessage() == null) {
            Map<String, String> err = new HashMap<>();
            err.put("content", "Error: Please provide a message.");
            return Flux.just(err);
        }
        String sessionId = request.getSessionId() != null ? request.getSessionId() : "default-session";
        return chatService.streamChat(sessionId, request.getMessage(), request.getImage())
                .map(content -> {
                    Map<String, String> map = new HashMap<>();
                    map.put("content", content);
                    return map;
                });
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
            "status", orchestrator.isRunning() ? "running" : "idle"
        ));
    }

    @PostMapping("/start")
    public ResponseEntity<?> startAutomation(@RequestBody Map<String, String> request) {
        String instruction = request.get("instruction");
        if (instruction == null || instruction.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Instruction is required."));
        }
        if (orchestrator.isRunning()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Automation already running."));
        }
        // Default to Google if no URL specified
        String url = request.getOrDefault("url", "https://www.google.com");
        executor.submit(() -> orchestrator.runFullTask(instruction, url));
        return ResponseEntity.ok(Map.of("status", "started", "message", "Automation started."));
    }

    @PostMapping("/stop")
    public ResponseEntity<?> stopAutomation() {
        orchestrator.stopTask();
        return ResponseEntity.ok(Map.of("status", "stopped", "message", "Automation stopped."));
    }

    @Data
    public static class ChatRequest {
        private String message;
        private String image;
        private String sessionId;
    }
}
