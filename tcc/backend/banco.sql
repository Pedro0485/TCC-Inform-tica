
CREATE DATABASE IF NOT EXISTS tcc_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'tcc_user'@'localhost' IDENTIFIED WITH mysql_native_password BY 'TccSenha123!';
GRANT ALL PRIVILEGES ON tcc_db.* TO 'tcc_user'@'localhost';
FLUSH PRIVILEGES;