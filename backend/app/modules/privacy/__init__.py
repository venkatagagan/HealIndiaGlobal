"""Privacy and data rights (DPDP Act 2023 + Rules 2025, EU/UK GDPR, HIPAA-style safeguards).

* ``export``   - machine-readable export of everything about the requesting user (GET /auth/me/export).
* ``erasure``  - complete account erasure / pseudonymisation shared by DELETE /auth/me and the purge jobs.
* ``guards``   - legal holds and the guardian-consent gate for patients under 18.
* ``service``  - data-rights requests, grievances, nominees, guardian consents, breach register, access log.
* ``tasks``    - retention purges and field re-encryption (``@periodic``).
"""
