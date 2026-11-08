# HealthyCropping — Costa Rican Field Validation Protocol & Results

This document specifies the real-world validation procedure and records empirical results for **HealthyCropping** (`com.keylorpineda.healthycroppingping`) using smartphone photos of Costa Rican coffee, cacao, and banana crops (completed in Phase 8 prior to the `v1.0.0` release).

---

## 1. Objectives

Public benchmark datasets (RoCoLe, BRACOL, CocoaMoniliaDataSet, UNAB, NM-AIST, BananaLSD) differ from real Costa Rican farms in phone camera sensors, background foliage, leaf moisture, and cultivar varieties (e.g., Costa Rican *Caturra*, *Catuaí*, and *Obatã* coffee cultivars; local Trinitario cacao clones; Cavendish banana). Field validation measures:
1. End-to-end on-device inference latency and offline reliability on an Android smartphone.
2. Agreement between on-device predictions and known reference conditions on Costa Rican field photos.
3. Calibration of the confidence threshold ("low confidence — retake the photo") on real-world and out-of-distribution captures.

---

## 2. Capture & Evaluation Procedure

1. **Test Device & Build**:
   - Physical Android smartphone running the standalone/development build of `com.keylorpineda.healthycroppingping` in **Airplane Mode** (verifying 100% offline execution).
2. **Sample Selection**:
   - Collect a validation set of real Costa Rican photos across the three target crops (**Coffee**, **Cacao**, **Banana**) covering healthy organs, primary disease classes, and challenging edge cases (wet leaves, harsh sunlight, off-angle framing).
   - Ensure no validation photo was present in any training or benchmark dataset.
3. **Standard Capture Protocol (Matching In-App Photo Tips)**:
   - **Coffee**: Center a single leaf filling `60–80%` of the frame; capture the **underside** when inspecting for *Hemileia vastatrix* (leaf rust) urediniospores, and upper/underside for *Cercospora* or leaf miner galleries. Avoid direct backlight.
   - **Cacao**: Frame a single attached pod at `20–40 cm` distance in diffuse shade so surface gibbosities, frost (*Monilia*), or dark brown lesions (*Phytophthora*) are clearly visible.
   - **Banana**: Frame the symptomatic leaf blade section against a clean background where necrotic streaks (*Black Sigatoka*) or marginal yellowing (*Fusarium*) are visible.
4. **Recorded Variables per Sample**:
   - Sample ID, Crop, Region/Canton in Costa Rica, Reference Condition, Lighting (`shade`, `direct_sun`, `overcast`, `wet`), Capture Source (`camera` vs. `gallery`), Predicted Class, Severity, Confidence (`%`), Status Badge (`healthy` / `watch` / `act_now` / `low_confidence`), Inference Latency (`ms`), and Notes.

---

## 3. Field Validation Results Table *(Populated in Phase 8)*

| Sample ID | Crop | Region (CR) | Lighting | Reference Condition | Predicted Class | Severity | Confidence | Status | Latency (ms) | Outcome / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `CR-COF-01` | Coffee | *Pending (Phase 8)* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* |
| `CR-CAC-01` | Cacao | *Pending (Phase 8)* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* |
| `CR-BAN-01` | Banana | *Pending (Phase 8)* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* | *Pending* |

---

## 4. Aggregate Summary & Failure Mode Analysis *(Populated in Phase 8)*

- **Coffee Summary**: *To be completed in Phase 8.*
- **Cacao Summary**: *To be completed in Phase 8.*
- **Banana Summary**: *To be completed in Phase 8.*
- **Observed Failure Modes & Mitigations**: *To be completed in Phase 8.*
