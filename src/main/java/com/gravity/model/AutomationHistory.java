package com.gravity.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "automation_history")
@Data
public class AutomationHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(columnDefinition = "TEXT")
    private String command;

    @Column(length = 2000)
    private String url;

    @Column(name = "actions_json", columnDefinition = "TEXT")
    private String actionsJson;

    @Enumerated(EnumType.STRING)
    private Status status;

    @Column(name = "executed_at")
    private LocalDateTime executedAt = LocalDateTime.now();

    public enum Status {
        SUCCESS, FAILED, PARTIAL
    }
}
