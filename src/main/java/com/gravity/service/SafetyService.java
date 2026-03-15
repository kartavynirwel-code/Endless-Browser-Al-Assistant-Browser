package com.gravity.service;

import lombok.Data;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;

@Service
public class SafetyService {

    public SafetyResult checkActions(List<Map<String, Object>> actions, String command) {
        boolean userWantsSubmit = command.toLowerCase().contains("submit") 
                               || command.toLowerCase().contains("buy")
                               || command.toLowerCase().contains("pay");

        for (Map<String, Object> action : actions) {
            String reason = (String) action.get("reason");
            String type = (String) action.get("action");
            
            if (isDestructive(type, reason)) {
                if (!userWantsSubmit) {
                    return new SafetyResult(Status.NEEDS_CONFIRMATION, "AI attempted a destructive action: " + reason);
                }
            }
        }
        return new SafetyResult(Status.SAFE, "All actions approved.");
    }

    private boolean isDestructive(String type, String reason) {
        String r = (reason != null ? reason : "").toLowerCase();
        return r.contains("submit") || r.contains("buy") || r.contains("pay") || r.contains("delete") 
               || "submit".equals(type);
    }

    @Data
    public static class SafetyResult {
        private final Status status;
        private final String message;
    }

    public enum Status {
        SAFE, NEEDS_CONFIRMATION, BLOCKED
    }
}
