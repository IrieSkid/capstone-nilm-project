DROP DATABASE IF EXISTS __DB_NAME__;
CREATE DATABASE __DB_NAME__;
USE __DB_NAME__;

CREATE TABLE tblroles (
  role_id INT PRIMARY KEY AUTO_INCREMENT,
  role_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE tbluser_status (
  status_id INT PRIMARY KEY AUTO_INCREMENT,
  status_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE tblusers (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  user_role_id INT NOT NULL,
  user_status_id INT NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  user_email VARCHAR(100) NOT NULL UNIQUE,
  user_password VARCHAR(255) NOT NULL,
  user_phone VARCHAR(20),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (user_role_id) REFERENCES tblroles(role_id),
  CONSTRAINT fk_users_status FOREIGN KEY (user_status_id) REFERENCES tbluser_status(status_id)
);

CREATE TABLE tbldevices (
  device_id INT PRIMARY KEY AUTO_INCREMENT,
  device_name VARCHAR(100) NOT NULL,
  device_identifier VARCHAR(100) NOT NULL UNIQUE,
  device_status ENUM('online', 'offline') NOT NULL DEFAULT 'offline',
  device_last_seen DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tblrooms (
  room_id INT PRIMARY KEY AUTO_INCREMENT,
  room_name VARCHAR(100) NOT NULL UNIQUE,
  room_tenant_id INT NOT NULL,
  room_device_id INT NOT NULL UNIQUE,
  room_rate_per_kwh DECIMAL(10, 2) NOT NULL DEFAULT 12.00,
  room_status ENUM('available', 'occupied') NOT NULL DEFAULT 'occupied',
  CONSTRAINT fk_rooms_tenant FOREIGN KEY (room_tenant_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_rooms_device FOREIGN KEY (room_device_id) REFERENCES tbldevices(device_id)
);

CREATE TABLE tblreading_headers (
  reading_header_id INT PRIMARY KEY AUTO_INCREMENT,
  reading_header_room_id INT NOT NULL,
  reading_header_device_id INT NOT NULL,
  reading_header_time DATETIME NOT NULL,
  CONSTRAINT fk_reading_headers_room FOREIGN KEY (reading_header_room_id) REFERENCES tblrooms(room_id),
  CONSTRAINT fk_reading_headers_device FOREIGN KEY (reading_header_device_id) REFERENCES tbldevices(device_id)
);

CREATE TABLE tblreading_details (
  reading_detail_id INT PRIMARY KEY AUTO_INCREMENT,
  reading_detail_header_id INT NOT NULL UNIQUE,
  reading_detail_voltage DECIMAL(10, 2) NOT NULL,
  reading_detail_current DECIMAL(10, 3) NOT NULL,
  reading_detail_power_w DECIMAL(10, 2) NOT NULL,
  reading_detail_frequency DECIMAL(10, 2) NOT NULL,
  reading_detail_power_factor DECIMAL(5, 2) NOT NULL,
  reading_detail_thd_percentage DECIMAL(5, 2) NOT NULL,
  reading_detail_energy_kwh DECIMAL(10, 4) NOT NULL,
  CONSTRAINT fk_reading_details_header FOREIGN KEY (reading_detail_header_id) REFERENCES tblreading_headers(reading_header_id)
);

CREATE TABLE tblappliance_categories (
  category_id INT PRIMARY KEY AUTO_INCREMENT,
  category_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE tblappliance_types (
  appliance_type_id INT PRIMARY KEY AUTO_INCREMENT,
  appliance_type_category_id INT NOT NULL,
  appliance_type_name VARCHAR(100) NOT NULL UNIQUE,
  appliance_type_typical_power_w DECIMAL(10, 2) NOT NULL,
  appliance_type_power_factor DECIMAL(5, 2) NOT NULL,
  appliance_type_nominal_frequency_hz DECIMAL(5, 2) NOT NULL DEFAULT 60.00,
  appliance_type_frequency_tolerance DECIMAL(5, 2) NOT NULL DEFAULT 0.50,
  appliance_type_thd_reference DECIMAL(5, 2) NOT NULL,
  appliance_type_harmonic_signature TEXT NULL,
  appliance_type_power_pattern ENUM('constant', 'cyclic', 'variable') NOT NULL DEFAULT 'constant',
  CONSTRAINT fk_appliance_types_category FOREIGN KEY (appliance_type_category_id) REFERENCES tblappliance_categories(category_id)
);

CREATE TABLE tbldevice_ports (
  device_port_id INT PRIMARY KEY AUTO_INCREMENT,
  device_port_device_id INT NOT NULL,
  device_port_label VARCHAR(30) NOT NULL,
  device_port_appliance_type_id INT NOT NULL,
  device_port_supply_state ENUM('on', 'off') NOT NULL DEFAULT 'on',
  device_port_last_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  device_port_last_changed_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_device_ports_device FOREIGN KEY (device_port_device_id) REFERENCES tbldevices(device_id),
  CONSTRAINT fk_device_ports_appliance FOREIGN KEY (device_port_appliance_type_id) REFERENCES tblappliance_types(appliance_type_id),
  CONSTRAINT fk_device_ports_changed_by FOREIGN KEY (device_port_last_changed_by_user_id) REFERENCES tblusers(user_id),
  CONSTRAINT uq_device_port_label UNIQUE (device_port_device_id, device_port_label)
);

CREATE TABLE tblappliance_detection_headers (
  detection_header_id INT PRIMARY KEY AUTO_INCREMENT,
  detection_header_room_id INT NOT NULL,
  detection_header_reading_header_id INT NOT NULL UNIQUE,
  detection_header_time DATETIME NOT NULL,
  CONSTRAINT fk_detection_headers_room FOREIGN KEY (detection_header_room_id) REFERENCES tblrooms(room_id),
  CONSTRAINT fk_detection_headers_reading FOREIGN KEY (detection_header_reading_header_id) REFERENCES tblreading_headers(reading_header_id)
);

CREATE TABLE tblappliance_detection_details (
  detection_detail_id INT PRIMARY KEY AUTO_INCREMENT,
  detection_detail_header_id INT NOT NULL,
  detection_detail_rank INT NOT NULL DEFAULT 1,
  detection_detail_appliance_type_id INT NOT NULL,
  detection_detail_status ENUM('ON', 'OFF') NOT NULL DEFAULT 'ON',
  detection_detail_confidence DECIMAL(5, 2) NOT NULL,
  detection_detail_detected_power DECIMAL(10, 2) NOT NULL,
  detection_detail_detected_frequency DECIMAL(10, 2) NOT NULL,
  detection_detail_detected_thd DECIMAL(5, 2) NOT NULL,
  CONSTRAINT fk_detection_details_header FOREIGN KEY (detection_detail_header_id) REFERENCES tblappliance_detection_headers(detection_header_id),
  CONSTRAINT fk_detection_details_appliance FOREIGN KEY (detection_detail_appliance_type_id) REFERENCES tblappliance_types(appliance_type_id),
  CONSTRAINT uq_detection_detail_header_rank UNIQUE (detection_detail_header_id, detection_detail_rank)
);

CREATE INDEX idx_users_role_status ON tblusers (user_role_id, user_status_id);
CREATE INDEX idx_reading_headers_room_time ON tblreading_headers (reading_header_room_id, reading_header_time);
CREATE INDEX idx_detection_headers_room_time ON tblappliance_detection_headers (detection_header_room_id, detection_header_time);
