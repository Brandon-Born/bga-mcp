-- Original minimal schema for the fixture. Framework tables are not declared here.
CREATE TABLE IF NOT EXISTS `token` (
  `token_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `token_owner` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`token_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
