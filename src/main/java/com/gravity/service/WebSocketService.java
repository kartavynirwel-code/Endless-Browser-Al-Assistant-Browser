package com.gravity.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebSocketService {

    private final SimpMessagingTemplate messagingTemplate;

    public void sendUpdate(String message) {
        log.info("Sending WS update: {}", message);
        messagingTemplate.convertAndSend("/topic/logs", Map.of("message", message, "type", "log"));
    }
    
    public void sendScreenshot(String base64Image) {
        messagingTemplate.convertAndSend("/topic/screen", Map.of("image", base64Image, "type", "image"));
    }
    
    public void sendStatus(String status) {
        messagingTemplate.convertAndSend("/topic/status", Map.of("status", status, "type", "status"));
    }
}
