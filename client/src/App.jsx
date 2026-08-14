import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import IssuePass from './pages/IssuePass.jsx';
import PassList from './pages/PassList.jsx';
import Events from './pages/Events.jsx';
import Users from './pages/Users.jsx';
import PublicPass from './pages/PublicPass.jsx';

function RequireAuth({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pass" element={<PublicPass />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="issue" element={<IssuePass />} />
          <Route path="passes" element={<PassList />} />
          <Route path="events" element={<Events />} />
          <Route path="users" element={<Users />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
