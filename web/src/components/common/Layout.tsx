import React from 'react';
import { Navbar } from './Navbar';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gray-50">
    <Navbar />
    <main className="container mx-auto px-4 py-6 sm:py-8">{children}</main>
  </div>
);
