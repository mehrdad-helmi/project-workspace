# Planicam Command Center

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated and approved: React, TypeScript, Vite, Bun/Hono, SQLite.

## Users and purpose

Mehrdad uses this personal workspace companion to read and edit the three Planicam repositories' documentation, record approved conclusions, organize tasks and notes, annotate calendar days, and inspect the backend schema. Agents use a local CLI with the same server rules.

## Operating context

One Windows host, trusted LAN, owner login, HTTP on port 7200. Gregorian calendar in Asia/Tehran; Saturday starts the week; Thursday and Friday are weekends. No notifications or cloud synchronization. App-owned content uses local Markdown and SQLite. Product repositories remain independently versioned.

## Principles

Use existing libraries, clear module boundaries, explicit saves, recoverable conflicts and deletion, and deterministic task rules. Conclusions require an explicit instruction after user approval.

## Brand commitments

The user supplied a dark cyberdeck / mission-control reference and a precise dark palette. Build directly from that reference; no separate image approval round.
