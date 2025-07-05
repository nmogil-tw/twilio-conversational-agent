import twilio from "twilio";
import type { WrapupCallWebhookPayload } from "../../completion-server/twilio/conversation-relay.js";
import log from "../../lib/logger.js";
import { FLEX_WORKFLOW_SID } from "../../shared/env.js";
import type { TransferToFlexHandoff } from "./types.js";

const VoiceResponse = twilio.twiml.VoiceResponse;

export function makeTransferToFlexHandoff(
  payload: WrapupCallWebhookPayload,
  handoffData: TransferToFlexHandoff
) {
  const taskAttributes = {
    ...handoffData,
  };
  log.info("flex", `Enqueing call ${payload.CallSid}`);
  const twiml = new VoiceResponse();
  twiml
    .enqueue({ workflowSid: FLEX_WORKFLOW_SID })
    .task({ priority: 1000 }, JSON.stringify(taskAttributes));

  return twiml.toString();
}
