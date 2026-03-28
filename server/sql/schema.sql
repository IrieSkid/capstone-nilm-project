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

CREATE TABLE tblapp_modules (
  module_id INT PRIMARY KEY AUTO_INCREMENT,
  module_key VARCHAR(50) NOT NULL UNIQUE,
  module_name VARCHAR(100) NOT NULL,
  module_description VARCHAR(255) NULL
);

CREATE TABLE tblrole_module_permissions (
  role_permission_id INT PRIMARY KEY AUTO_INCREMENT,
  role_permission_role_id INT NOT NULL,
  role_permission_module_id INT NOT NULL,
  can_access TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_permission_role_id) REFERENCES tblroles(role_id),
  CONSTRAINT fk_role_permissions_module FOREIGN KEY (role_permission_module_id) REFERENCES tblapp_modules(module_id),
  CONSTRAINT uq_role_module_permission UNIQUE (role_permission_role_id, role_permission_module_id)
);

CREATE TABLE tblusers (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  user_role_id INT NOT NULL,
  user_status_id INT NOT NULL,
  user_landlord_id INT NULL,
  landlord_registration_code VARCHAR(30) NULL UNIQUE,
  user_name VARCHAR(100) NOT NULL,
  user_email VARCHAR(100) NOT NULL UNIQUE,
  user_password VARCHAR(255) NOT NULL,
  user_phone VARCHAR(20),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (user_role_id) REFERENCES tblroles(role_id),
  CONSTRAINT fk_users_status FOREIGN KEY (user_status_id) REFERENCES tbluser_status(status_id),
  CONSTRAINT fk_users_landlord FOREIGN KEY (user_landlord_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tbluser_module_permissions (
  user_permission_id INT PRIMARY KEY AUTO_INCREMENT,
  user_permission_user_id INT NOT NULL,
  user_permission_module_id INT NOT NULL,
  can_access TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_permission_user_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_user_permissions_module FOREIGN KEY (user_permission_module_id) REFERENCES tblapp_modules(module_id),
  CONSTRAINT uq_user_module_permission UNIQUE (user_permission_user_id, user_permission_module_id)
);

CREATE TABLE tblrbac_audit_logs (
  audit_log_id INT PRIMARY KEY AUTO_INCREMENT,
  changed_by_user_id INT NOT NULL,
  target_scope ENUM('role', 'user') NOT NULL,
  target_role_id INT NULL,
  target_user_id INT NULL,
  target_module_id INT NOT NULL,
  previous_state VARCHAR(20) NOT NULL,
  next_state VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rbac_audit_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_rbac_audit_role FOREIGN KEY (target_role_id) REFERENCES tblroles(role_id),
  CONSTRAINT fk_rbac_audit_user FOREIGN KEY (target_user_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_rbac_audit_module FOREIGN KEY (target_module_id) REFERENCES tblapp_modules(module_id)
);

CREATE TABLE tbldevices (
  device_id INT PRIMARY KEY AUTO_INCREMENT,
  device_name VARCHAR(100) NOT NULL,
  device_identifier VARCHAR(100) NOT NULL UNIQUE,
  device_owner_landlord_id INT NULL,
  device_status ENUM('online', 'offline') NOT NULL DEFAULT 'offline',
  device_last_seen DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_devices_owner_landlord FOREIGN KEY (device_owner_landlord_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tblrooms (
  room_id INT PRIMARY KEY AUTO_INCREMENT,
  room_name VARCHAR(100) NOT NULL UNIQUE,
  room_landlord_id INT NULL,
  room_tenant_id INT NULL,
  room_device_id INT NULL UNIQUE,
  room_rate_per_kwh DECIMAL(10, 2) NOT NULL DEFAULT 12.00,
  room_status ENUM('available', 'occupied') NOT NULL DEFAULT 'available',
  CONSTRAINT fk_rooms_landlord FOREIGN KEY (room_landlord_id) REFERENCES tblusers(user_id),
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

CREATE TABLE tblbilling_cycles (
  billing_cycle_id INT PRIMARY KEY AUTO_INCREMENT,
  billing_cycle_room_id INT NOT NULL,
  billing_cycle_tenant_id INT NOT NULL,
  billing_cycle_landlord_id INT NOT NULL,
  billing_cycle_device_id INT NOT NULL,
  billing_cycle_period_start DATE NOT NULL,
  billing_cycle_period_end DATE NOT NULL,
  billing_cycle_opening_reading_header_id INT NOT NULL,
  billing_cycle_closing_reading_header_id INT NULL,
  billing_cycle_opening_energy_kwh DECIMAL(10, 4) NOT NULL,
  billing_cycle_closing_energy_kwh DECIMAL(10, 4) NULL,
  billing_cycle_rate_per_kwh_snapshot DECIMAL(10, 2) NOT NULL,
  billing_cycle_status ENUM('open', 'closed', 'statement_issued', 'cancelled') NOT NULL DEFAULT 'open',
  billing_cycle_closed_at DATETIME NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_cycles_room FOREIGN KEY (billing_cycle_room_id) REFERENCES tblrooms(room_id),
  CONSTRAINT fk_billing_cycles_tenant FOREIGN KEY (billing_cycle_tenant_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_cycles_landlord FOREIGN KEY (billing_cycle_landlord_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_cycles_device FOREIGN KEY (billing_cycle_device_id) REFERENCES tbldevices(device_id),
  CONSTRAINT fk_billing_cycles_opening_reading FOREIGN KEY (billing_cycle_opening_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
  CONSTRAINT fk_billing_cycles_closing_reading FOREIGN KEY (billing_cycle_closing_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
  CONSTRAINT fk_billing_cycles_created_by FOREIGN KEY (created_by_user_id) REFERENCES tblusers(user_id),
  CONSTRAINT uq_billing_cycle_room_period UNIQUE (billing_cycle_room_id, billing_cycle_period_start, billing_cycle_period_end)
);

CREATE TABLE tblbilling_statements (
  billing_statement_id INT PRIMARY KEY AUTO_INCREMENT,
  billing_statement_cycle_id INT NOT NULL UNIQUE,
  billing_statement_room_id INT NOT NULL,
  billing_statement_tenant_id INT NOT NULL,
  billing_statement_landlord_id INT NOT NULL,
  billing_statement_device_id INT NOT NULL,
  billing_statement_period_start DATE NOT NULL,
  billing_statement_period_end DATE NOT NULL,
  billing_statement_opening_reading_header_id INT NOT NULL,
  billing_statement_closing_reading_header_id INT NOT NULL,
  billing_statement_opening_energy_kwh DECIMAL(10, 4) NOT NULL,
  billing_statement_closing_energy_kwh DECIMAL(10, 4) NOT NULL,
  billing_statement_billed_kwh DECIMAL(10, 4) NOT NULL,
  billing_statement_rate_per_kwh_snapshot DECIMAL(10, 2) NOT NULL,
  billing_statement_subtotal_amount DECIMAL(10, 2) NOT NULL,
  billing_statement_adjustments_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  billing_statement_total_amount DECIMAL(10, 2) NOT NULL,
  billing_statement_status ENUM('draft', 'issued', 'partially_paid', 'paid', 'void') NOT NULL DEFAULT 'draft',
  billing_statement_number VARCHAR(50) NULL UNIQUE,
  billing_statement_due_date DATE NULL,
  billing_statement_issued_at DATETIME NULL,
  billing_statement_notes TEXT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_statements_cycle FOREIGN KEY (billing_statement_cycle_id) REFERENCES tblbilling_cycles(billing_cycle_id),
  CONSTRAINT fk_billing_statements_room FOREIGN KEY (billing_statement_room_id) REFERENCES tblrooms(room_id),
  CONSTRAINT fk_billing_statements_tenant FOREIGN KEY (billing_statement_tenant_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_statements_landlord FOREIGN KEY (billing_statement_landlord_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_statements_device FOREIGN KEY (billing_statement_device_id) REFERENCES tbldevices(device_id),
  CONSTRAINT fk_billing_statements_opening_reading FOREIGN KEY (billing_statement_opening_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
  CONSTRAINT fk_billing_statements_closing_reading FOREIGN KEY (billing_statement_closing_reading_header_id) REFERENCES tblreading_headers(reading_header_id),
  CONSTRAINT fk_billing_statements_created_by FOREIGN KEY (created_by_user_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tblbilling_statement_items (
  billing_statement_item_id INT PRIMARY KEY AUTO_INCREMENT,
  billing_statement_item_statement_id INT NOT NULL,
  billing_statement_item_label VARCHAR(120) NOT NULL,
  billing_statement_item_description VARCHAR(255) NULL,
  billing_statement_item_quantity DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
  billing_statement_item_unit VARCHAR(20) NULL,
  billing_statement_item_unit_amount DECIMAL(10, 2) NOT NULL,
  billing_statement_item_total_amount DECIMAL(10, 2) NOT NULL,
  billing_statement_item_sort_order INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_statement_items_statement FOREIGN KEY (billing_statement_item_statement_id) REFERENCES tblbilling_statements(billing_statement_id)
);

CREATE TABLE tblbilling_payments (
  billing_payment_id INT PRIMARY KEY AUTO_INCREMENT,
  billing_payment_statement_id INT NOT NULL,
  billing_payment_tenant_id INT NOT NULL,
  billing_payment_landlord_id INT NOT NULL,
  billing_payment_amount DECIMAL(10, 2) NOT NULL,
  billing_payment_method VARCHAR(50) NOT NULL,
  billing_payment_reference_number VARCHAR(120) NULL,
  billing_payment_notes TEXT NULL,
  billing_payment_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  billing_payment_rejection_reason VARCHAR(255) NULL,
  billing_payment_submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  billing_payment_verified_at DATETIME NULL,
  billing_payment_verified_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_payments_statement FOREIGN KEY (billing_payment_statement_id) REFERENCES tblbilling_statements(billing_statement_id),
  CONSTRAINT fk_billing_payments_tenant FOREIGN KEY (billing_payment_tenant_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_payments_landlord FOREIGN KEY (billing_payment_landlord_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_payments_verified_by FOREIGN KEY (billing_payment_verified_by_user_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tblbilling_receipts (
  billing_receipt_id INT PRIMARY KEY AUTO_INCREMENT,
  billing_receipt_payment_id INT NOT NULL UNIQUE,
  billing_receipt_statement_id INT NOT NULL,
  billing_receipt_tenant_id INT NOT NULL,
  billing_receipt_landlord_id INT NOT NULL,
  billing_receipt_number VARCHAR(50) NOT NULL UNIQUE,
  billing_receipt_amount DECIMAL(10, 2) NOT NULL,
  billing_receipt_notes TEXT NULL,
  billing_receipt_issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_receipts_payment FOREIGN KEY (billing_receipt_payment_id) REFERENCES tblbilling_payments(billing_payment_id),
  CONSTRAINT fk_billing_receipts_statement FOREIGN KEY (billing_receipt_statement_id) REFERENCES tblbilling_statements(billing_statement_id),
  CONSTRAINT fk_billing_receipts_tenant FOREIGN KEY (billing_receipt_tenant_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_receipts_landlord FOREIGN KEY (billing_receipt_landlord_id) REFERENCES tblusers(user_id),
  CONSTRAINT fk_billing_receipts_created_by FOREIGN KEY (created_by_user_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tblnotifications (
  notification_id INT PRIMARY KEY AUTO_INCREMENT,
  notification_user_id INT NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  notification_title VARCHAR(150) NOT NULL,
  notification_message TEXT NOT NULL,
  notification_reference_type VARCHAR(50) NULL,
  notification_reference_id INT NULL,
  notification_action_path VARCHAR(255) NULL,
  notification_is_read TINYINT(1) NOT NULL DEFAULT 0,
  notification_read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (notification_user_id) REFERENCES tblusers(user_id)
);

CREATE TABLE tblnotification_preferences (
  notification_preference_id INT PRIMARY KEY AUTO_INCREMENT,
  preference_user_id INT NOT NULL,
  preference_key VARCHAR(60) NOT NULL,
  preference_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_preferences_user FOREIGN KEY (preference_user_id) REFERENCES tblusers(user_id),
  CONSTRAINT uq_notification_preferences_user_key UNIQUE (preference_user_id, preference_key)
);

CREATE TABLE tblroom_alert_settings (
  room_alert_setting_id INT PRIMARY KEY AUTO_INCREMENT,
  room_alert_room_id INT NOT NULL UNIQUE,
  room_alert_warning_power_w DECIMAL(10, 2) NOT NULL DEFAULT 1200.00,
  room_alert_overload_power_w DECIMAL(10, 2) NOT NULL DEFAULT 1800.00,
  room_alert_notify_tenant TINYINT(1) NOT NULL DEFAULT 1,
  room_alert_notify_landlord TINYINT(1) NOT NULL DEFAULT 1,
  room_alert_notify_admin TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_room_alert_settings_room FOREIGN KEY (room_alert_room_id) REFERENCES tblrooms(room_id)
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
CREATE INDEX idx_users_landlord_owner ON tblusers (user_landlord_id);
CREATE INDEX idx_role_module_permissions_role ON tblrole_module_permissions (role_permission_role_id, can_access);
CREATE INDEX idx_user_module_permissions_user ON tbluser_module_permissions (user_permission_user_id, can_access);
CREATE INDEX idx_rbac_audit_created_at ON tblrbac_audit_logs (created_at);
CREATE INDEX idx_rooms_landlord ON tblrooms (room_landlord_id);
CREATE INDEX idx_devices_owner_landlord ON tbldevices (device_owner_landlord_id);
CREATE INDEX idx_reading_headers_room_time ON tblreading_headers (reading_header_room_id, reading_header_time);
CREATE INDEX idx_billing_cycles_room_status ON tblbilling_cycles (billing_cycle_room_id, billing_cycle_status);
CREATE INDEX idx_billing_cycles_tenant_status ON tblbilling_cycles (billing_cycle_tenant_id, billing_cycle_status);
CREATE INDEX idx_billing_cycles_landlord_status ON tblbilling_cycles (billing_cycle_landlord_id, billing_cycle_status);
CREATE INDEX idx_billing_statements_landlord_status ON tblbilling_statements (billing_statement_landlord_id, billing_statement_status);
CREATE INDEX idx_billing_statements_tenant_status ON tblbilling_statements (billing_statement_tenant_id, billing_statement_status);
CREATE INDEX idx_billing_statement_items_statement ON tblbilling_statement_items (billing_statement_item_statement_id, billing_statement_item_sort_order);
CREATE INDEX idx_billing_payments_statement_status ON tblbilling_payments (billing_payment_statement_id, billing_payment_status);
CREATE INDEX idx_billing_payments_landlord_status ON tblbilling_payments (billing_payment_landlord_id, billing_payment_status);
CREATE INDEX idx_billing_payments_tenant_status ON tblbilling_payments (billing_payment_tenant_id, billing_payment_status);
CREATE INDEX idx_billing_receipts_statement_issued ON tblbilling_receipts (billing_receipt_statement_id, billing_receipt_issued_at);
CREATE INDEX idx_notifications_user_read_created ON tblnotifications (notification_user_id, notification_is_read, created_at);
CREATE INDEX idx_notification_preferences_user ON tblnotification_preferences (preference_user_id, preference_enabled);
CREATE INDEX idx_room_alert_settings_room ON tblroom_alert_settings (room_alert_room_id);
CREATE INDEX idx_detection_headers_room_time ON tblappliance_detection_headers (detection_header_room_id, detection_header_time);
