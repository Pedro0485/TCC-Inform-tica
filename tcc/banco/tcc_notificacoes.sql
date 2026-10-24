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
-- Table structure for table `notificacoes`
--

DROP TABLE IF EXISTS `notificacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `titulo` varchar(150) NOT NULL,
  `mensagem` text NOT NULL,
  `tipo` varchar(30) NOT NULL DEFAULT 'info',
  `destino_tipo` enum('todos','professores','turmas','professor','turma') NOT NULL,
  `destino_id` int DEFAULT NULL,
  `criado_por` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_notificacoes_criador` (`criado_por`),
  KEY `idx_notificacoes_destino` (`destino_tipo`,`destino_id`),
  KEY `idx_notificacoes_created` (`created_at`),
  CONSTRAINT `fk_notificacoes_criador` FOREIGN KEY (`criado_por`) REFERENCES `professores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notificacoes`
--

LOCK TABLES `notificacoes` WRITE;
/*!40000 ALTER TABLE `notificacoes` DISABLE KEYS */;
INSERT INTO `notificacoes` VALUES (3,'Reunião','Sala 12','info','todos',NULL,3,'2026-08-24 14:42:21'),(4,'Reunião','Sala 12','info','todos',NULL,3,'2026-08-24 14:50:03'),(5,'Aviso','Se prepare Vandy, a cadeira vem vindo!','info','todos',NULL,3,'2026-08-24 14:52:25'),(6,'Reunião','sala 12','info','todos',NULL,3,'2026-08-24 15:05:09'),(7,'Reunião','sala 12','info','todos',NULL,3,'2026-08-24 15:05:29'),(8,'Reunião','e','info','todos',NULL,3,'2026-08-24 15:17:13'),(9,'Reunião importante','Sala 12','info','todos',NULL,3,'2026-08-26 10:25:22'),(10,'Comer o cuzinho do Bruno','Sala 12','info','todos',NULL,3,'2026-08-26 10:26:12'),(11,'Reunião','sala 12','info','professor',7,5,'2026-08-26 12:06:46'),(12,'Reunião importante','sala 12','info','professor',3,5,'2026-08-26 12:08:08'),(13,'Reunião','sala 12','info','todos',NULL,5,'2026-08-26 13:27:03'),(14,'Reunião','sala 13','info','todos',NULL,5,'2026-08-27 14:43:39'),(15,'Reunião importante','Tcc','info','professor',8,5,'2026-09-14 13:15:15');
/*!40000 ALTER TABLE `notificacoes` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-05 11:32:12
