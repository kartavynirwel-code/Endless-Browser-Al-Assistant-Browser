package com.gravity.service;

import io.github.bonigarcia.wdm.WebDriverManager;
import lombok.extern.slf4j.Slf4j;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class SeleniumService {

    private final Map<String, WebDriver> activeSessions = new ConcurrentHashMap<>();

    /**
     * Start a new Chrome browser session.
     * Returns a sessionId that can be used for subsequent operations.
     */
    public String startBrowser(boolean headless) {
        log.info("Attaching to existing Electron browser via remote debugger on port 9222");
        try {
            WebDriverManager.chromedriver().setup();
        } catch (Exception e) {
            log.warn("WebDriverManager setup issue (may still work): {}", e.getMessage());
        }

        ChromeOptions options = new ChromeOptions();
        options.setExperimentalOption("debuggerAddress", "localhost:9222");

        WebDriver driver = new ChromeDriver(options);
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(3));
        
        String sessionId = UUID.randomUUID().toString();
        activeSessions.put(sessionId, driver);
        log.info("Browser attached with session: {}", sessionId);
        
        // Find and switch to the correct webview
        switchToWebview(driver);

        // Verify connection works and warn if it's the shell
        try {
            String title = driver.getTitle();
            String url = driver.getCurrentUrl();
            log.info("Connected to: {} | {}", title, url);
            // If it's the Electron UI page (file://), log warning
            if (url != null && url.startsWith("file://")) {
                log.warn("Connected to Electron UI shell, not the webview content!");
                log.warn("Selenium automation will work on main window, not embedded webview.");
            }
        } catch (Exception e) {
            log.error("Could not verify connection: {}", e.getMessage());
            throw new RuntimeException("Selenium connection failed: " + e.getMessage());
        }

        return sessionId;
    }
    
    /**
     * Finds the actual embedded webview within the Electron app and switches to it.
     */
    private void switchToWebview(WebDriver driver) {
        String currentHandle = driver.getWindowHandle();
        Set<String> handles = driver.getWindowHandles();
        log.info("Found {} window handles. Currently on {}", handles.size(), currentHandle);
        
        // We look through all window handles to find the one that is NOT the main electron UI
        // The main electron UI title is usually 'Endless Browser' or similar, URL starts with file://
        for (String handle : handles) {
            try {
                driver.switchTo().window(handle);
                String url = driver.getCurrentUrl();
                if (url != null && !url.startsWith("file://") && !url.contains("devtools://")) {
                    log.info("Successfully switched to embedded webview target: {}", url);
                    return; // We found the webpage!
                }
            } catch (Exception ignored) {}
        }
        log.warn("Could not reliably detect the embedded webview! Staying on current handle.");
    }

    /**
     * Navigate to a URL and wait for page load.
     */
    public void navigateTo(String sessionId, String url) {
        WebDriver driver = getDriver(sessionId);
        log.info("Navigating to: {}", url);
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        driver.get(url);
        // Wait for page to be ready
        waitForPageLoad(driver);
        log.info("Navigation complete. Title: {}", driver.getTitle());
    }

    /**
     * Extract all interactive DOM elements from the current page.
     * Returns a JSON-like list for the AI to consume.
     */
    public String extractDOM(String sessionId) {
        WebDriver driver = getDriver(sessionId);
        JavascriptExecutor js = (JavascriptExecutor) driver;

        String script = """
            (() => {
                const results = [];
                let id = 0;
                document.querySelectorAll(
                    'input:not([type="hidden"]), button, select, textarea, a[href], ' +
                    '[role="button"], [role="radio"], [role="checkbox"], [role="link"], ' +
                    '[role="menuitem"], [role="tab"], [contenteditable="true"]'
                ).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return;
                    if (rect.top < -200 || rect.top > window.innerHeight + 300) return;
                    
                    const tag = el.tagName.toLowerCase();
                    const currentId = id++;
                    el.setAttribute('data-gravity-id', currentId);
                    
                    let label = '';
                    if (el.id) {
                        const lbl = document.querySelector('label[for="' + el.id + '"]');
                        if (lbl) label = lbl.innerText.trim();
                    }
                    if (!label) {
                        const parent = el.closest('label');
                        if (parent) label = parent.innerText.trim();
                    }
                    if (!label) {
                        let prev = el.previousElementSibling;
                        if (prev) label = (prev.innerText || '').trim().substring(0, 100);
                    }
                    if (!label && el.getAttribute('aria-label')) label = el.getAttribute('aria-label');
                    if (!label && el.placeholder) label = el.placeholder;
                    if (!label && el.name) label = el.name;
                    if (!label && el.title) label = el.title;
                    
                    results.push({
                        id: currentId,
                        tag: tag,
                        type: el.type || '',
                        name: el.name || '',
                        value: (el.value || '').substring(0, 50),
                        label: label.substring(0, 120),
                        text: (el.innerText || el.textContent || '').trim().substring(0, 80),
                        placeholder: (el.placeholder || '').substring(0, 60),
                        checked: el.checked || false,
                        isInteractive: true
                    });
                });
                return JSON.stringify(results);
            })()
        """;

        try {
            String result = (String) js.executeScript("return " + script);
            log.info("DOM extraction complete: {} characters", result != null ? result.length() : 0);
            return result;
        } catch (Exception e) {
            log.error("DOM extraction failed: {}", e.getMessage());
            return "[]";
        }
    }

    /**
     * Extract visible page text.
     */
    public String extractPageText(String sessionId) {
        WebDriver driver = getDriver(sessionId);
        JavascriptExecutor js = (JavascriptExecutor) driver;
        try {
            String text = (String) js.executeScript("return document.body.innerText.substring(0, 8000)");
            return text != null ? text : "";
        } catch (Exception e) {
            log.error("Page text extraction failed: {}", e.getMessage());
            return "";
        }
    }

    /**
     * Capture screenshot as base64 string.
     */
    public String captureScreenshot(String sessionId) {
        WebDriver driver = getDriver(sessionId);
        try {
            TakesScreenshot screenshotDriver = (TakesScreenshot) driver;
            String base64 = screenshotDriver.getScreenshotAs(OutputType.BASE64);
            return "data:image/png;base64," + base64;
        } catch (Exception e) {
            log.error("Screenshot capture failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Get current page URL.
     */
    public String getCurrentUrl(String sessionId) {
        return getDriver(sessionId).getCurrentUrl();
    }

    /**
     * Execute a single automation action on the page.
     * Action map should contain: action, targetId, value, reason
     */
    public String executeAction(String sessionId, Map<String, Object> action) {
        WebDriver driver = getDriver(sessionId);
        JavascriptExecutor js = (JavascriptExecutor) driver;

        String type = String.valueOf(action.getOrDefault("action", ""));
        Object targetIdObj = action.get("targetId");
        String value = String.valueOf(action.getOrDefault("value", ""));
        String reason = String.valueOf(action.getOrDefault("reason", ""));

        log.info("Executing action: {} on target={} value='{}' reason='{}'", type, targetIdObj, value, reason);

        try {
            switch (type) {
                case "click" -> {
                    WebElement el = findByGravityId(driver, targetIdObj);
                    if (el == null) return "Element not found: " + targetIdObj;
                    scrollIntoView(js, el);

                    String elType = el.getAttribute("type");
                    if ("radio".equalsIgnoreCase(elType) || "checkbox".equalsIgnoreCase(elType)) {
                        // Use JS to set checked and fire events for radio/checkbox
                        js.executeScript(
                            "arguments[0].checked = true; " +
                            "arguments[0].dispatchEvent(new Event('change', {bubbles: true})); " +
                            "arguments[0].dispatchEvent(new Event('click', {bubbles: true}));",
                            el
                        );
                    } else {
                        try {
                            el.click();
                        } catch (ElementClickInterceptedException e) {
                            log.warn("Click intercepted, trying JS click");
                            js.executeScript("arguments[0].click()", el);
                        }
                    }
                    return "Clicked: " + reason;
                }

                case "type" -> {
                    WebElement el = findByGravityId(driver, targetIdObj);
                    if (el == null) return "Element not found: " + targetIdObj;
                    scrollIntoView(js, el);
                    el.clear();
                    
                    // Human-like typing (very fast, 5-20ms delay per char)
                    for (char c : value.toCharArray()) {
                        if (!isSessionActive(sessionId)) break; // stop if aborted
                        el.sendKeys(String.valueOf(c));
                        Thread.sleep(5 + (long)(Math.random() * 15));
                    }
                    
                    // Also fire input/change events via JS for React/Angular frameworks
                    js.executeScript(
                        "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));" +
                        "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
                        el
                    );
                    return "Typed '" + value + "': " + reason;
                }

                case "select" -> {
                    WebElement el = findByGravityId(driver, targetIdObj);
                    if (el == null) return "Element not found: " + targetIdObj;
                    scrollIntoView(js, el);
                    Select select = new Select(el);
                    try {
                        select.selectByVisibleText(value);
                    } catch (org.openqa.selenium.NoSuchElementException e) {
                        // Try partial match
                        boolean found = false;
                        for (WebElement option : select.getOptions()) {
                            if (option.getText().toLowerCase().contains(value.toLowerCase())) {
                                select.selectByVisibleText(option.getText());
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            try { select.selectByValue(value); }
                            catch (Exception ex) { return "Could not select: " + value; }
                        }
                    }
                    js.executeScript("arguments[0].dispatchEvent(new Event('change', {bubbles: true}));", el);
                    return "Selected '" + value + "': " + reason;
                }

                case "scroll" -> {
                    int px = 400;
                    try { px = Integer.parseInt(value); } catch (Exception ignored) {}
                    js.executeScript("window.scrollBy(0, " + px + ")");
                    return "Scrolled " + px + "px";
                }

                case "navigate" -> {
                    navigateTo(sessionId, value);
                    return "Navigated to: " + value;
                }

                case "done" -> {
                    return "DONE";
                }

                case "error" -> {
                    return "AI Error: " + reason;
                }

                default -> {
                    log.warn("Unknown action type: {}", type);
                    return "Unknown action: " + type;
                }
            }
        } catch (Exception e) {
            log.error("Action execution failed: {} - {}", type, e.getMessage());
            return "Error executing " + type + ": " + e.getMessage();
        }
    }

    /**
     * Close browser session and clean up.
     */
    public void closeBrowser(String sessionId) {
        WebDriver driver = activeSessions.remove(sessionId);
        if (driver != null) {
            log.info("Detached from Electron session: {}", sessionId);
            // DO NOT call driver.quit() because that will close the user's entire Electron app
            // We just let the WebDriver instance be garbage collected to detach
        }
    }

    /**
     * Check if session is still active.
     */
    public boolean isSessionActive(String sessionId) {
        return activeSessions.containsKey(sessionId);
    }

    /**
     * Close all active browser sessions (for cleanup on shutdown).
     */
    public void closeAllBrowsers() {
        activeSessions.clear(); // Same here, do not quit() the attached browser
    }

    // ── Private helpers ──

    private WebDriver getDriver(String sessionId) {
        WebDriver driver = activeSessions.get(sessionId);
        if (driver == null) {
            throw new IllegalStateException("No active browser session: " + sessionId);
        }
        return driver;
    }

    private WebElement findByGravityId(WebDriver driver, Object targetId) {
        if (targetId == null) return null;
        String idStr = String.valueOf(targetId);
        // Remove decimal point if present (e.g. "3.0" -> "3")
        if (idStr.contains(".")) {
            idStr = idStr.substring(0, idStr.indexOf("."));
        }
        String selector = "[data-gravity-id=\"" + idStr + "\"]";
        
        // Fast path / DSA Optimization: immediately attempt to find it without polling
        try {
            List<WebElement> els = driver.findElements(By.cssSelector(selector));
            if (!els.isEmpty()) {
                return els.get(0);
            }
        } catch (Exception ignored) {}

        // Fallback: wait for it
        try {
            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(3));
            return wait.until(ExpectedConditions.presenceOfElementLocated(By.cssSelector(selector)));
        } catch (TimeoutException e) {
            log.warn("Element not found with selector: {}", selector);
            return null;
        }
    }

    private void scrollIntoView(JavascriptExecutor js, WebElement el) {
        try {
            js.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", el);
        } catch (Exception ignored) {}
    }

    private void waitForPageLoad(WebDriver driver) {
        try {
            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));
            wait.until(d -> ((JavascriptExecutor) d)
                    .executeScript("return document.readyState").equals("complete"));
            Thread.sleep(500); // Small buffer for dynamic content
        } catch (Exception e) {
            log.warn("Page load wait issue: {}", e.getMessage());
        }
    }
}
