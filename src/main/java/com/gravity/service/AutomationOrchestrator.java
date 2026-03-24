package com.gravity.service;

import com.gravity.model.AutomationSession;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AutomationOrchestrator {

    private final VisionService visionService;
    private final ReasoningService reasoningService;
    private final SafetyService safetyService;
    private final SessionService sessionService;
    private final WebSocketService webSocketService;
    private final SeleniumService seleniumService;
    private final com.gravity.model.AutomationSessionRepository sessionRepository;

    private volatile boolean running = false;
    private volatile String activeBrowserSession = null;

    /**
     * Run a full automation task using Selenium.
     * This navigates to the URL, captures the page, gets AI actions, executes them.
     */
    public void runFullTask(String command, String targetUrl) {
        if (running) {
            webSocketService.sendUpdate("⚠️ Automation already running. Stop it first.");
            return;
        }

        running = true;
        String browserSessionId = null;

        try {
            // 1. Create a DB session to track this automation
            AutomationSession dbSession = sessionService.startSession(command);
            String dbSessionId = dbSession.getId();

            webSocketService.sendStatus("thinking");
            webSocketService.sendUpdate("🚀 Starting Selenium automation: " + command);

            // 2. Launch Selenium browser
            browserSessionId = seleniumService.startBrowser(false);
            activeBrowserSession = browserSessionId;

            // 3. We are natively attached to the Electron webview, so NO navigation needed.
            // The user is already on the correct page.
            webSocketService.sendUpdate("🌐 Connected to existing tab.");

            // 4. Capture initial screenshot
            String screenshot = seleniumService.captureScreenshot(browserSessionId);
            if (screenshot != null) {
                webSocketService.sendScreenshot(screenshot);
            }

            // 5. Multi-step automation loop (max 5 steps)
            for (int step = 0; step < 5 && running; step++) {
                webSocketService.sendUpdate("📋 Step " + (step + 1) + ": Analyzing page...");
                webSocketService.sendStatus("thinking");

                // Extract DOM and page text via Selenium
                String dom = seleniumService.extractDOM(browserSessionId);
                String pageText = seleniumService.extractPageText(browserSessionId);
                String url = seleniumService.getCurrentUrl(browserSessionId);

                log.info("Step {}: DOM length={}, pageText length={}", step + 1,
                        dom != null ? dom.length() : 0,
                        pageText != null ? pageText.length() : 0);

                // Smart Vision: Only call if page text is thin
                String visualSummary = "Visual analysis skipped - using page text.";
                if (pageText == null || pageText.trim().length() < 300) {
                    log.info("pageText is thin, calling moondream for visual help...");
                    if (screenshot != null) {
                        visualSummary = visionService.analyzeScreenshot(screenshot);
                        webSocketService.sendUpdate("👁️ Visual Analysis: " + visualSummary);
                    }
                }

                // Get action history
                List<String> history = sessionService.getHistory(dbSessionId);

                // Ask AI to plan actions
                webSocketService.sendUpdate("🧠 AI is planning actions...");
                List<Map<String, Object>> actions = reasoningService.planActions(
                        command, pageText, dom, visualSummary, history);

                if (actions.isEmpty()) {
                    webSocketService.sendUpdate("⚠️ AI could not determine actions. Retrying...");
                    continue;
                }

                // Safety check
                SafetyService.SafetyResult safety = safetyService.checkActions(actions, command);

                // Save step to DB
                int stepNumber = history.size() + 1;
                sessionService.saveStep(dbSessionId, stepNumber, url, null,
                        pageText, visualSummary, actions);

                webSocketService.sendUpdate("⚡ Executing " + safety.getSafeActions().size() + " actions...");
                webSocketService.sendStatus("acting");

                // Execute each action via Selenium
                boolean taskDone = false;
                for (Map<String, Object> action : safety.getSafeActions()) {
                    if (!running) break;

                    String actionType = String.valueOf(action.getOrDefault("action", ""));
                    String reason = String.valueOf(action.getOrDefault("reason", ""));

                    if ("done".equals(actionType)) {
                        taskDone = true;
                        break;
                    }

                    if ("error".equals(actionType)) {
                        webSocketService.sendUpdate("❌ AI Error: " + reason);
                        continue;
                    }

                    // Execute the action via Selenium
                    String result = seleniumService.executeAction(browserSessionId, action);
                    webSocketService.sendUpdate("🤖 " + result);

                    // Small delay between actions for page to react
                    Thread.sleep(400);
                }

                // Capture screenshot after actions
                screenshot = seleniumService.captureScreenshot(browserSessionId);
                if (screenshot != null) {
                    webSocketService.sendScreenshot(screenshot);
                }

                if (taskDone) {
                    webSocketService.sendUpdate("✅ Task completed successfully!");
                    sessionService.completeSession(dbSessionId, AutomationSession.Status.COMPLETED);
                    break;
                }

                // If safety blocked something, notify
                if (safety.getStatus() == SafetyService.Status.NEEDS_CONFIRMATION) {
                    webSocketService.sendUpdate("⚠️ " + safety.getMessage());
                }

                // Wait a bit before next analysis step
                Thread.sleep(800);
            }

            if (running) {
                webSocketService.sendUpdate("✅ Automation finished.");
            } else {
                webSocketService.sendUpdate("⏹️ Automation stopped by user.");
            }

        } catch (Exception e) {
            log.error("Automation error: ", e);
            webSocketService.sendUpdate("❌ Automation error: " + e.getMessage());
        } finally {
            // Cleanup
            running = false;
            if (browserSessionId != null) {
                seleniumService.closeBrowser(browserSessionId);
            }
            activeBrowserSession = null;
            webSocketService.sendStatus("idle");
        }
    }

    /**
     * Stop the current automation task.
     */
    public void stopTask() {
        running = false;
        if (activeBrowserSession != null) {
            seleniumService.closeBrowser(activeBrowserSession);
            activeBrowserSession = null;
        }
        webSocketService.sendUpdate("⏹️ Automation stopped.");
        webSocketService.sendStatus("idle");
    }

    /**
     * Check if automation is currently running.
     */
    public boolean isRunning() {
        return running;
    }

    /**
     * Legacy method for backward compatibility with existing StepRequest flow.
     */
    public StepResult executeStep(String sessionId, String screenshot,
                                   String dom, String pageText, String url) {
        log.info("Orchestrating legacy step for session: {}", sessionId);

        List<String> history = sessionService.getHistory(sessionId);
        AutomationSession session = sessionRepository.findById(sessionId).orElseThrow();
        String command = session.getCommand();

        String visualSummary = "Visual analysis skipped - using page text.";
        if (pageText == null || pageText.trim().length() < 300) {
            visualSummary = visionService.analyzeScreenshot(screenshot);
            webSocketService.sendUpdate("Visual Analysis: " + visualSummary);
        }

        List<Map<String, Object>> actions = reasoningService.planActions(
                command, pageText, dom, visualSummary, history);

        SafetyService.SafetyResult safety = safetyService.checkActions(actions, command);

        int stepNumber = history.size() + 1;
        sessionService.saveStep(sessionId, stepNumber, url, screenshot,
                pageText, visualSummary, actions);

        StepResult result = new StepResult();
        result.setActions(safety.getSafeActions());
        result.setStatus(safety.getStatus() == SafetyService.Status.SAFE
                         ? "RUNNING" : "NEEDS_CONFIRMATION");
        result.setMessage(safety.getMessage());

        if (actions.stream().anyMatch(a -> "done".equals(a.get("action")))) {
            result.setStatus("DONE");
            sessionService.completeSession(sessionId, AutomationSession.Status.COMPLETED);
        }

        return result;
    }

    @Data
    public static class StepResult {
        private List<Map<String, Object>> actions;
        private String status;
        private String message;
    }
}
