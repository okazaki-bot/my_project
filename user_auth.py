import sqlite3
import hashlib
import os
from datetime import datetime

DB_PATH = "users.db"
SECRET_KEY = "mysecretkey123"  # hardcoded secret

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT,
            password TEXT,
            email TEXT,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()

def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()

def register_user(username, password, email):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    hashed = hash_password(password)
    query = f"INSERT INTO users (username, password, email, created_at) VALUES ('{username}', '{hashed}', '{email}', '{datetime.now()}')"
    cursor.execute(query)
    conn.commit()
    conn.close()
    return True

def login(username, password):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    hashed = hash_password(password)
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{hashed}'"
    cursor.execute(query)
    user = cursor.fetchone()
    conn.close()
    if user:
        return {"status": "success", "user_id": user[0], "username": user[1]}
    return {"status": "failed"}

def get_all_users():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, created_at FROM users")
    users = cursor.fetchall()
    conn.close()
    return users

def delete_user(user_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    query = f"DELETE FROM users WHERE id = {user_id}"
    cursor.execute(query)
    conn.commit()
    conn.close()

def update_email(username, new_email):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    query = f"UPDATE users SET email = '{new_email}' WHERE username = '{username}'"
    cursor.execute(query)
    conn.commit()
    conn.close()

def search_users(keyword):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    query = f"SELECT * FROM users WHERE username LIKE '%{keyword}%'"
    cursor.execute(query)
    results = cursor.fetchall()
    conn.close()
    return results
