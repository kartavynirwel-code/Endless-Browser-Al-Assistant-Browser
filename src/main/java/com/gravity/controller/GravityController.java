package com.gravity.controller;

import com.gravity.model.AIResponse;
import com.gravity.service.AIService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/gravity")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class GravityController {

    private final AIService aiService;

    @PostMapping("/vision-chat")
    public ResponseEntity<?> visionChat(@RequestBody VisionChatRequest request) {
        if (request == null || request.getInstruction() == null || request.getInstruction().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Instruction cannot be empty"));
        }

        // Clean base64 string if it contains the data uri prefix
        String screenshot = request.getScreenshot();
        if (screenshot != null && screenshot.startsWith("data:image")) {
            screenshot = screenshot.substring(screenshot.indexOf(",") + 1);
        }

        AIResponse response = aiService.getNextAction(request.getInstruction(), screenshot, request.getHistory());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody ChatRequest request) {
        if (request == null || request.getMessage() == null || request.getMessage().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("reply", "Please provide a message."));
        }
        String reply = aiService.chat(request.getMessage(), request.getImage());
        return ResponseEntity.ok(Map.of("reply", reply));
    }

    @GetMapping("/status")
    public ResponseEntity<?> getStatus() {
        return ResponseEntity.ok(Map.of(
            "status", "idle" // Backend is always ready now since frontend holds state
        ));
    }

    @Data
    public static class VisionChatRequest {
        private String instruction;
        private String screenshot;
        private List<String> history;
    }

    @Data
    public static class ChatRequest {
        private String message;
        private String image;
    }
}
