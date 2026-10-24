-- MySQL dump 10.13  Distrib 8.0.40, for Win64 (x86_64)
--
-- Host: localhost    Database: tcc
-- ------------------------------------------------------
-- Server version	8.0.40

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `professores`
--

DROP TABLE IF EXISTS `professores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `senha` varchar(255) NOT NULL,
  `admin` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nome` (`nome`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `professores`
--

LOCK TABLES `professores` WRITE;
/*!40000 ALTER TABLE `professores` DISABLE KEYS */;
INSERT INTO `professores` VALUES (1,'vinicius','vinicius@gmail.com','$2b$10$ZbW7mut7LvyOVc5y88QnOuhkJqKRgkuWbWRtW3SlBHVPU1zlZc8K2',1,'2026-07-17 05:13:42','2026-07-17 05:13:42'),(3,'Admin','admin@gmail.com','$2b$10$Bg8B1eS74KYnDFTLIMWD8.CdWaVQZ6Y4rmsK4s5aNc9x.unB9/BMO',1,'2026-07-28 03:23:20','2026-07-28 03:28:40'),(5,'Pedro','pedro@gmail.com','$2b$10$cYmg3cHeFXKtRlHaDvmcA.G6MnnRq9vxx900gpSEFMU7tYPDj7px6',1,'2026-08-26 10:44:04','2026-08-31 15:21:42'),(7,'Gabriel','gabriel@gmail.com','$2b$10$vrvw.DYRef/wzM4D0Vm.b.VUVVeK3eueOEiH20b9I7RVHuHEzRUN.',1,'2026-08-26 10:51:16','2026-08-26 10:51:16'),(8,'Ota','ota@gmail.com','$2b$10$E.3ueFZe2HXMjucvJ0JAyuthowYW4kMAnzfcyCYg/d1L0mvmY1fY6',0,'2026-08-27 14:43:07','2026-09-14 13:14:54'),(9,'Giovani','giovani@gmail.com','$2b$10$0sfKJAl9bDMvB4xSyjbKoukfDDNhBN6MLuhicLhZgXN7lfH2T3fHm',1,'2026-08-31 15:21:21','2026-08-31 15:21:21');
/*!40000 ALTER TABLE `professores` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-05 11:32:11
