package com.gravity.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "user_profiles")
@Data
public class UserProfile {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "profile_name", length = 100)
    private String profileName;

    @Column(name = "data_json", columnDefinition = "TEXT")
    private String dataJson;
}
