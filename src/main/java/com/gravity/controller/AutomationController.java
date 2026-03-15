package com.gravity.controller;

import com.gravity.model.AutomationHistory;
import com.gravity.model.AutomationHistoryRepository;
import com.gravity.model.AutomationSession;
import com.gravity.model.AutomationSessionRepository;
import com.gravity.service.AutomationOrchestrator;
import com.gravity.service.SessionService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/automation")
@RequiredArgsConstructor
public class AutomationController {

    private final AutomationOrchestrator orchestrator;
    private final SessionService sessionService;
    private final AutomationSessionRepository sessionRepository;

    @PostMapping("/start")
    public AutomationSession start(@RequestBody StartRequest request) {
        return sessionService.startSession(request.getCommand());
    }

    @PostMapping("/step")
    public AutomationOrchestrator.StepResult step(@RequestBody StepRequest request) {
        return orchestrator.executeStep(
                request.getSessionId(),
                request.getScreenshot(),
                request.getDom(),
                request.getPageText(),
                request.getUrl()
        );
    }

    @PostMapping("/stop/{sessionId}")
    public void stop(@PathVariable String sessionId) {
        sessionService.completeSession(sessionId, AutomationSession.Status.STOPPED);
    }

    @Data
    public static class StartRequest {
        private String command;
    }

    @Data
    public static class StepRequest {
        private String sessionId;
        private String screenshot;
        private String dom;
        private String pageText;
        private String url;
    }
}
