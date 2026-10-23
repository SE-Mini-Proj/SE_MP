-- Migration: 002_user_registration_uniqueness.up.sql
-- Description: Enforce case-insensitive uniqueness for user emails and usernames.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM users
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot create unique email index: case-insensitive duplicates exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM users
        GROUP BY LOWER(username)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot create unique username index: case-insensitive duplicates exist';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
    ON users (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
    ON users (LOWER(username));
