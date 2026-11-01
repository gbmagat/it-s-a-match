-- Tables for the it's-a-match study site (MySQL 8). Run by server/setup.js.

CREATE TABLE IF NOT EXISTS participants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(12) NULL UNIQUE,              -- P-001, P-002, ...
  token_hash CHAR(64) NOT NULL UNIQUE,       -- sha256 of the secret kept in the participant's browser
  first_name VARCHAR(60) NOT NULL,
  birth_date DATE NOT NULL,
  age TINYINT UNSIGNED NOT NULL,
  bio VARCHAR(400) NOT NULL,
  match_letter CHAR(1) NULL,                 -- 'A' (Filipino) or 'B' (English)
  completed TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- chats finished (0-3)
  done_order VARCHAR(3) NULL,                -- Text Styles finished, in the order done, e.g. 'BAC' (A formal, B informal, C colloquial)
  is_test TINYINT(1) NOT NULL DEFAULT 0,     -- test run: kept out of the study data
  signed_up_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  matched_at DATETIME NULL,
  finished_at DATETIME NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX by_match (match_letter, is_test)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-10-24: participants choose the Text Style order themselves (it used to be
-- assigned). Adds done_order to an existing table; does nothing on a new one.
-- An existing table keeps its old order_no column (unused), so rows made
-- before the change keep the order they were given.
SET @step = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE participants ADD COLUMN done_order VARCHAR(3) NULL AFTER completed', 'DO 0')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants' AND COLUMN_NAME = 'done_order');
PREPARE step FROM @step; EXECUTE step; DEALLOCATE PREPARE step;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  expires_at DATETIME NOT NULL
) ENGINE=InnoDB;
