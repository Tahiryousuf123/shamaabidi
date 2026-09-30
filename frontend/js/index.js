/**
 * Shama Abidi PhD System — Modular Frontend Orchestrator (Section 9)
 * Aggregates all 11 specialized ES modules into a unified production interface.
 */
import * as api from "./api.js";
import * as auth from "./auth.js";
import * as dashboard from "./dashboard.js";
import * as universities from "./universities.js";
import * as professors from "./professors.js";
import * as applications from "./applications.js";
import * as emails from "./emails.js";
import * as funding from "./funding.js";
import * as jobs from "./jobs.js";
import * as settings from "./settings.js";
import * as utils from "./utils.js";

export const ShamaProductionModules = {
  api,
  auth,
  dashboard,
  universities,
  professors,
  applications,
  emails,
  funding,
  jobs,
  settings,
  utils,
};

if (typeof window !== "undefined") {
  window.ShamaProductionModules = ShamaProductionModules;
}
