# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript project for converting Figma designs to React components using the Figma MCP (Model Context Protocol) integration.

## Commands

- `npm run dev` - Start development server with HMR
- `npm run build` - Type-check with TypeScript and build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Tech Stack

- React 19 with TypeScript
- Vite 7 for bundling and dev server
- ESLint with React Hooks and React Refresh plugins

## Figma MCP Integration

This project uses the Figma Desktop MCP server to fetch design context and generate React components. The MCP server runs at `http://127.0.0.1:3845/mcp` when Figma Desktop is open with a design file active.

When converting Figma designs:
- Use `get_design_context` to fetch component code for a node
- Provide `dirForAssetWrites` parameter pointing to `src/assets` for image exports
- The MCP returns React + Tailwind code that may need adaptation to the project's styling approach
- Node IDs from Figma URLs use format `node-id=X-Y` which converts to `X:Y` for MCP calls
