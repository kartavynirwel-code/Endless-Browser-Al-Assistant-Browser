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

        List<Map<String, Object>> safeActions = new java.util.ArrayList<>();
        String blockedReason = null;

        for (Map<String, Object> action : actions) {
            String reason = (String) action.getOrDefault("reason", "");
            String type = (String) action.getOrDefault("action", "");
            
            if (isDestructive(type, reason)) {
                if (!userWantsSubmit) {
                    blockedReason = reason;
                    continue; // Skip destructive action
                }
            }
            safeActions.add(action);
        }

        if (blockedReason != null) {
            return new SafetyResult(Status.NEEDS_CONFIRMATION, 
                "AI attempted a destructive action: " + blockedReason, safeActions);
        }
        return new SafetyResult(Status.SAFE, "All actions approved.", safeActions);
    }

    private boolean isDestructive(String type, String reason) {
        String r = (reason != null ? reason : "").toLowerCase();
        // Only block FORM submit, not search submit
        boolean isFormSubmit = (r.contains("submit") && !r.contains("search"))
                || r.contains("buy")
                || r.contains("pay")
                || r.contains("delete")
                || r.contains("purchase")
                || "submit".equals(type);
        return isFormSubmit;
    }

    @Data
    public static class SafetyResult {
        private final Status status;
        private final String message;
        private final List<Map<String, Object>> safeActions;
    }

    public enum Status {
        SAFE, NEEDS_CONFIRMATION, BLOCKED
    }
}
