package com.gravity.controller;

import com.gravity.model.AutomationSession;
import com.gravity.model.AutomationSessionRepository;
import com.gravity.service.AutomationOrchestrator;
import com.gravity.service.SessionService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
@RequestMapping("/api/automation")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class AutomationController {

    private final AutomationOrchestrator orchestrator;
    private final SessionService sessionService;
    private final AutomationSessionRepository sessionRepository;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /**
     * NEW: Start a Selenium-based automation task.
     * Runs asynchronously — progress is sent via WebSocket.
     */
    @PostMapping("/run")
    public ResponseEntity<?> run(@RequestBody RunRequest request) {
        if (orchestrator.isRunning()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("status", "error", "message", "Automation already running. Stop it first."));
        }

        String command = request.getCommand();
        String url = request.getUrl();

        if (command == null || command.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("status", "error", "message", "Command is required."));
        }

        if (url == null || url.isBlank()) {
            url = "https://www.google.com";
        }

        // Run task asynchronously so the HTTP response returns immediately
        final String targetUrl = url;
        executor.submit(() -> orchestrator.runFullTask(command, targetUrl));

        return ResponseEntity.ok(Map.of(
                "status", "started",
                "message", "Automation started. Watch WebSocket for progress."
        ));
    }

    /**
     * NEW: Stop the current Selenium automation task.
     */
    @PostMapping("/stop")
    public ResponseEntity<?> stop() {
        orchestrator.stopTask();
        return ResponseEntity.ok(Map.of("status", "stopped", "message", "Automation stopped."));
    }

    /**
     * Check if automation is currently running.
     */
    @GetMapping("/status")
    public ResponseEntity<?> status() {
        return ResponseEntity.ok(Map.of(
                "running", orchestrator.isRunning(),
                "status", orchestrator.isRunning() ? "running" : "idle"
        ));
    }

    /**
     * Legacy: Start a session (for old frontend flow).
     */
    @PostMapping("/start")
    public AutomationSession start(@RequestBody StartRequest request) {
        return sessionService.startSession(request.getCommand());
    }

    /**
     * Legacy: Execute a single step with frontend-provided data.
     */
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

    /**
     * Legacy: Stop a session by ID.
     */
    @PostMapping("/stop/{sessionId}")
    public void stopSession(@PathVariable String sessionId) {
        sessionService.completeSession(sessionId, AutomationSession.Status.STOPPED);
    }

    @Data
    public static class RunRequest {
        private String command;
        private String url;
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
