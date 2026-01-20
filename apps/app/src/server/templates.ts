import {
  getDatabaseTemplates,
  getProjectTemplates,
  getServiceTemplates,
  getTemplates,
} from "@/lib/templates";
import { os } from "./orpc";

export const templates = {
  list: os.templates.list.handler(getTemplates),
  services: os.templates.services.handler(getServiceTemplates),
  projects: os.templates.projects.handler(getProjectTemplates),
  databases: os.templates.databases.handler(getDatabaseTemplates),
};

export const dbTemplates = {
  list: os.dbTemplates.list.handler(getDatabaseTemplates),
};
