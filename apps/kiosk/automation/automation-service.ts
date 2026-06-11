import { chromium, type Page } from "playwright";
import type { SelectorRecord, WorkflowDefinition, WorkflowStepDefinition } from "@smart-kiosk/shared-types";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

async function fetchActiveWorkflow(slug: string): Promise<WorkflowDefinition> {
  const response = await fetch(`${apiUrl}/workflows/${encodeURIComponent(slug)}/active`);
  if (!response.ok) {
    throw new Error(`Workflow ${slug} was not found`);
  }
  const workflow = await response.json();
  const active = workflow.versions?.[0];
  if (!active?.definition) {
    throw new Error(`Workflow ${slug} has no active definition`);
  }
  return active.definition;
}

async function fetchSelector(selectorId: string): Promise<SelectorRecord> {
  const response = await fetch(`${apiUrl}/selectors`);
  if (!response.ok) {
    throw new Error("Selector list request failed");
  }
  const selectors = await response.json();
  const selector = selectors.find((item: { selectorKey?: string }) => item.selectorKey === selectorId);
  if (!selector?.selectorType || !selector?.selectorValue) {
    throw new Error(`Selector ${selectorId} is not active`);
  }
  return {
    selectorKey: selector.selectorKey,
    selectorType: selector.selectorType,
    selectorValue: selector.selectorValue,
    priority: selector.priority
  };
}

function locatorFor(page: Page, selector: SelectorRecord) {
  if (selector.selectorType === "data-testid") {
    return page.getByTestId(selector.selectorValue);
  }
  if (selector.selectorType === "aria-label") {
    return page.getByLabel(selector.selectorValue);
  }
  if (selector.selectorType === "text") {
    return page.getByText(selector.selectorValue);
  }
  if (selector.selectorType === "css") {
    return page.locator(selector.selectorValue);
  }
  if (selector.selectorType === "xpath") {
    return page.locator(`xpath=${selector.selectorValue}`);
  }
  throw new Error("Image selector requires the vision adapter configured by the automation service");
}

async function executeStep(page: Page, step: WorkflowStepDefinition) {
  if (step.action === "open") {
    await page.goto(step.url ?? "https://dichvucong.gov.vn/", { waitUntil: "domcontentloaded" });
    return;
  }

  if (!step.selectorId) {
    throw new Error(`Step ${step.stepKey} requires selectorId`);
  }

  const selector = await fetchSelector(step.selectorId);
  const locator = locatorFor(page, selector);
  const timeout = step.timeoutMs ?? 30000;

  if (step.action === "click") {
    await locator.click({ timeout });
    return;
  }

  if (step.action === "input") {
    const value = process.env[`INPUT_${step.inputSource ?? ""}`];
    if (!value) {
      throw new Error(`Input source ${step.inputSource} is not available`);
    }
    await locator.fill(value, { timeout });
    return;
  }

  if (step.action === "upload") {
    const filePath = process.env[`FILE_${step.inputSource ?? ""}`];
    if (!filePath) {
      throw new Error(`File source ${step.inputSource} is not available`);
    }
    await locator.setInputFiles(filePath, { timeout });
    return;
  }

  if (step.action === "assert") {
    await locator.waitFor({ timeout });
    return;
  }

  if (step.action === "screenshot") {
    await page.screenshot({ path: `automation-${Date.now()}.png`, fullPage: true });
  }
}

async function reportFailure(sessionId: string, step: WorkflowStepDefinition, page: Page, error: unknown) {
  const screenshotPath = `automation-failure-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const htmlSnapshot = await page.content();
  await fetch(`${apiUrl}/automation/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      stepKey: step.stepKey,
      level: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      evidence: {
        screenshotUrl: screenshotPath,
        htmlSnapshot
      }
    })
  });
}

export async function runWorkflow(slug: string, sessionId: string) {
  const workflow = await fetchActiveWorkflow(slug);
  const browserMode = (process.env.BROWSER_MODE || (process.env.HEADLESS === "false" ? "hidden" : "headless")).toLowerCase();
  const headless = browserMode === "headless";
  const browser = await chromium.launch({
    headless,
    args: !headless && browserMode !== "visible" ? ["--window-position=-32000,-32000", "--window-size=1366,900"] : [],
  });
  const context = await browser.newContext({
    recordVideo: { dir: "automation-videos" }
  });
  const page = await context.newPage();

  try {
    for (const step of workflow.steps) {
      const attempts = step.retryCount ?? 3;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await executeStep(page, step);
          break;
        } catch (error) {
          if (attempt === attempts) {
            await reportFailure(sessionId, step, page, error);
            throw error;
          }
        }
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

if (process.argv[2]) {
  void runWorkflow(process.argv[2], process.env.AUTOMATION_SESSION_ID ?? "").catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
