# Security Policy

## Supported Versions

Only the latest release on the `main` branch and the most recent tagged APK release receive security updates.

| Version | Supported |
| :--- | :--- |
| `0.x` / `1.0.x` (latest) | Yes |
| Older tags | No |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, please report them privately using [**GitHub Security Advisories**](https://github.com/keylorpineda/healthycrop/security/advisories/new):

1. Navigate to the **Security** tab of the `keylorpineda/healthycrop` repository.
2. Click **Report a vulnerability** to open a private advisory draft.
3. Provide a clear description of the vulnerability, steps to reproduce, affected component (`app`, `api`, or `ml`), and potential impact.

If you are unable to use GitHub Security Advisories, contact the maintainer directly at **keylorpineda729@gmail.com** with the subject `[SECURITY] HealthyCropping`.

## Response Timeline

- **Initial acknowledgment**: within 72 hours.
- **Status update & triage**: within 7 days.
- **Remediation & disclosure**: coordinated privately once a fix is verified and released.

## Security Architecture Highlights

- **Zero Direct Database Access from Client**: The Android app never talks to Firestore directly; Firestore security rules deny all client read/write operations. All authenticated requests pass a Firebase ID token to the FastAPI backend (`api/`), which enforces per-user isolation (`ownerUid`) via the Firebase Admin SDK.
- **Signed Media Uploads**: The Android app never holds Cloudinary private keys; the FastAPI server issues short-lived signed upload parameters scoped to the authenticated user's folder.
- **Data Privacy in AI Explanations**: Prompts sent to the Gemini API contain only crop, disease class, severity, and retrieved agronomic context—never user names, emails, or GPS coordinates.
- **Secret Hygiene**: Credentials (`*.env`, `service-account*.json`, `google-services.json`, `kaggle.json`, signing keystores) are strictly excluded from version control and enforced via pre-commit hooks.
