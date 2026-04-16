import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerAuthRoutes } from "./auth";
import { initializeDatabase } from "./db";
import * as fs from "fs";
import * as path from "path";

const app = express();
app.set("trust proxy", 1);
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    // Replit domains (kept for local dev / rollback)
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    // Generic allowed origins (used for Railway and any other host)
    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(",").forEach((o) => {
        origins.add(o.trim());
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const supportPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "support.html",
  );
  const supportPageTemplate = fs.readFileSync(supportPath, "utf-8");
  const privacyPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "privacy.html",
  );
  const privacyPageTemplate = fs.readFileSync(privacyPath, "utf-8");
  const termsPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "terms.html",
  );
  const termsPageTemplate = fs.readFileSync(termsPath, "utf-8");
  const appName = getAppName();

  const webBuildDir = path.resolve(process.cwd(), "dist");
  const webIndexPath = path.join(webBuildDir, "index.html");
  const hasWebBuild = fs.existsSync(webIndexPath);

  log(
    hasWebBuild
      ? `Web PWA build found at ${webBuildDir} — serving as the default web response`
      : "No web build found; browsers will fall back to the marketing landing page",
  );
  log("Serving static Expo files with dynamic manifest routing");

  const LEGAL_PAGES: Record<string, string> = {
    "/support": supportPageTemplate,
    "/privacy": privacyPageTemplate,
    "/terms": termsPageTemplate,
  };

  // 1) Expo native manifest: /, /manifest with `expo-platform: ios|android`.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    if (req.path !== "/" && req.path !== "/manifest") return next();

    const platform = req.header("expo-platform");
    if (platform === "ios" || platform === "android") {
      return serveExpoManifest(platform, res);
    }

    next();
  });

  // 2) Legal pages: served verbatim regardless of whether a PWA is built.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const page = LEGAL_PAGES[req.path];
    if (!page) return next();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(page);
  });

  // 3) PWA static assets (when the web build is present).
  if (hasWebBuild) {
    app.use(
      express.static(webBuildDir, {
        // Let the SW handle version-based cache busting for HTML; everything
        // else is hashed by Metro and safe to cache for a long time.
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
          } else if (filePath.includes(`${path.sep}_expo${path.sep}`)) {
            res.setHeader(
              "Cache-Control",
              "public, max-age=31536000, immutable",
            );
          }
        },
      }),
    );
  }

  // 4) Native static bundle + /assets (used by the Expo manifest response).
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  // 5) Root request: PWA if built, otherwise marketing landing page.
  app.get("/", (req: Request, res: Response) => {
    if (hasWebBuild) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      return res.status(200).sendFile(webIndexPath);
    }
    return serveLandingPage({
      req,
      res,
      landingPageTemplate,
      appName,
    });
  });

  // 6) SPA fallback: any unknown GET that isn't an API call gets the PWA
  //    shell so expo-router can handle client-side routing.
  app.get(/^(?!\/api\/).*/, (req: Request, res: Response, next: NextFunction) => {
    if (!hasWebBuild) return next();
    if (req.method !== "GET") return next();

    // Don't swallow requests that look like assets — let them 404 naturally.
    const ext = path.extname(req.path);
    if (ext && ext !== ".html") return next();

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    return res.status(200).sendFile(webIndexPath);
  });
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  await initializeDatabase();

  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
    console.warn("[startup] WARNING: AI_INTEGRATIONS_ANTHROPIC_API_KEY is not set — the AI sommelier will not work.");
  }

  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  registerAuthRoutes(app);
  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`express server serving on port ${port}`);

      // Start notification scheduler (gated behind env var)
      if (process.env.NODE_ENV !== "test" && process.env.ENABLE_SCHEDULER === "true") {
        import("./scheduler").then((m) => m.initializeScheduler()).catch((err) => {
          console.error("[scheduler] Failed to initialize:", err);
        });
      }
    },
  );
})();
