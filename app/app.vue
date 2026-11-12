<template>
  <NuxtPage />
</template>

<style>
/* 全ページ共通 (詳細ページを直接開いても効くよう app.vue に置く) */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f7fa;
  color: #333;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

h1 {
  font-size: 1.5rem;
  color: #1a365d;
}

.login-section {
  text-align: center;
  padding: 4rem 2rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.login-section p {
  margin-bottom: 1.5rem;
  color: #666;
}

.btn {
  padding: 0.5rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: #2b6cb0;
  color: #fff;
}

.btn-primary:hover {
  background: #2c5282;
}

.btn-primary:disabled {
  background: #a0aec0;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e2e8f0;
  color: #4a5568;
}

.btn-secondary:hover {
  background: #cbd5e0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.date-range {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
}

.date-range label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #666;
}

.date-range input {
  padding: 0.4rem 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 4px;
  font-size: 0.9rem;
}

.error {
  background: #fed7d7;
  color: #c53030;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.count {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.table th,
.table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.85rem;
}

.table th {
  background: #f7fafc;
  font-weight: 600;
  color: #4a5568;
  white-space: nowrap;
}

.table tbody tr:hover {
  background: #f7fafc;
}

.table tbody tr.clickable {
  cursor: pointer;
}

.table tbody tr.clickable:hover {
  background: #ebf8ff;
}

.mono {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 0.8rem;
}

.env-badge {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.5em;
  vertical-align: middle;
}

.env-prod {
  background: #e8f5e9;
  color: #2e7d32;
}

.env-sbx {
  background: #fff3e0;
  color: #e65100;
}

.status-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.status-arrived {
  background: #bee3f8;
  color: #2a4365;
}

.status-reviewing {
  background: #fefcbf;
  color: #744210;
}

.status-completed {
  background: #c6f6d5;
  color: #22543d;
}

.status-withdrawn {
  background: #e2e8f0;
  color: #4a5568;
}

.empty {
  text-align: center;
  padding: 3rem;
  color: #a0aec0;
  background: #fff;
  border-radius: 8px;
}
</style>
