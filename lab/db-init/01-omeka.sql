-- Runs once via MariaDB's /docker-entrypoint-initdb.d/ (only on a fresh, empty
-- datadir). MYSQL_DATABASE in docker-compose.yml already creates `moodle`; this
-- adds the second database Omeka S needs, on the same server.
CREATE DATABASE IF NOT EXISTS omeka CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
