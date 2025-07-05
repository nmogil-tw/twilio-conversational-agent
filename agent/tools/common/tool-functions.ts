import Twilio from "twilio";
import { v4 as uuidV4 } from "uuid";
import { db } from "../../../integration-server/mock-database.js";
import {
  DEFAULT_TWILIO_NUMBER,
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  SEGMENT_PROFILE_API_TOKEN,
  SEGMENT_SPACE_ID,
  SEGMENT_TRACKING_WRITE_KEY,
} from "../../../shared/env.js";
import type { AuxiliaryMessage } from "../../../shared/session/context.js";
import type { ToolExecutor } from "../../types.js";
import {SegmentProfileClient} from "../../../lib/profile.js";
import {GetProfileEventsSchema, GetProfileTraitsSchema, IdentifyEventSchema} from "../../../lib/segment_schemas.js";
import {SegmentTrackingClient} from "../../../lib/tracking.js";
import { transferToFlexAgent } from "../../../modules/flex-transfer-to-agent/tools.js";

// Initialize clients only if environment variables are available
const twilio = (TWILIO_API_KEY && TWILIO_API_SECRET && TWILIO_ACCOUNT_SID) 
  ? Twilio(TWILIO_API_KEY, TWILIO_API_SECRET, { accountSid: TWILIO_ACCOUNT_SID })
  : null;

const profileClient = (SEGMENT_SPACE_ID && SEGMENT_PROFILE_API_TOKEN) 
  ? new SegmentProfileClient(SEGMENT_SPACE_ID, SEGMENT_PROFILE_API_TOKEN)
  : null;

const trackingClient = SEGMENT_TRACKING_WRITE_KEY 
  ? new SegmentTrackingClient(SEGMENT_TRACKING_WRITE_KEY)
  : null;

/****************************************************
 Get Profile Traits
 ****************************************************/
interface GetProfileTraits {
  external_id: string;
  space_id: string;
}

export const getProfileTraits: ToolExecutor<
    GetProfileTraits
    > = async (args, deps) => {
  if (!profileClient) {
    return {
      success: false,
      error: "Segment profile client not configured (missing environment variables)"
    };
  }

  const validatedParams = GetProfileTraitsSchema.parse(args);
  const traitsResponse = await profileClient.getProfileTraits(
      validatedParams.external_id,
      validatedParams.space_id
  );

  return {
    success: true,
    external_id: validatedParams.external_id,
    traits: traitsResponse.traits,
    cursor: traitsResponse.cursor,
  };
}

interface GetProfileEvents {
  userId: string;
  spaceId: string;
}

export const getProfileEvents: ToolExecutor<
    GetProfileEvents
    > = async (args, deps) => {
  if (!profileClient) {
    return {
      success: false,
      error: "Segment profile client not configured (missing environment variables)"
    };
  }

  const validatedParams = GetProfileEventsSchema.parse(args);
  const eventsResponse = await profileClient.getProfileEvents(
      validatedParams.external_id,
      {
        limit: validatedParams.limit,
        cursor: validatedParams.cursor,
        spaceId: validatedParams.space_id,
        exclude:
            "AI Conversation Started,AI Message Sent,AI Response Received,AI Query Executed,AI Feedback Given,AI Call Operator Completed",
      }
  );

  if (!eventsResponse.data || !Array.isArray(eventsResponse.data)) {
    throw new Error("No events found for the given profile.");
  }

  return {
    success: true,
    external_id: validatedParams.external_id,
    events: eventsResponse.data,
    cursor: eventsResponse.cursor,
    total_events: eventsResponse.data.length,
  };
}

interface IdentifyUser {
  user_id: string;
  traits: object;
}

export const identify_user: ToolExecutor<
    IdentifyUser
    > = async (args, deps) => {
  if (!trackingClient) {
    return {
      success: false,
      error: "Segment tracking client not configured (missing environment variables)"
    };
  }

  const validatedParams = IdentifyEventSchema.parse(args);
  await trackingClient.identify({
    userId: validatedParams.user_id,
    anonymousId: validatedParams.anonymous_id,
    traits: validatedParams.traits,
    timestamp: validatedParams.timestamp,
    context: validatedParams.context,
    integrations: validatedParams.integrations,
  });
  return {
    success: true,
    message: `Successfully identified user: ${validatedParams.user_id}`,
  };
}

/****************************************************
 Get Entity
 ****************************************************/
interface GetEntity {
  entity?: string;
  rowId?: string;
}

export const getEntity: ToolExecutor<GetEntity> = async (args, deps) => {
  switch (args.entity) {
    case "account":
      return [
        {
          ID: "act_74hfnjj",
          CUSTOMER_ID: deps.store.context.user?.user_id.replace("user_id:", ""),
          STATUS: "open",
          BALANCE: 1000,
          CURRENCY: "USD",
          ACCOUNT_TYPE: "credit_card",
          CREATED_AT: "2023-01-01T00:00:00Z",
          UPDATED_AT: "2023-01-02T00:00:00Z",
        },
      ];
    case "transaction":
      return [
        {
          ID: "txn_123",
          ACCOUNT_ID: "act_74hfnjj",
          AMOUNT: 89.47,
          CURRENCY: "USD",
          DESCRIPTION: "WALMART SUPERCENTER #1234",
          MERCHANT: "Walmart",
          STATUS: "completed",
          CREATED_AT: "2025-06-25T14:23:00Z",
          CARD_LAST_4: "4567",
        },
        {
          ID: "txn_456",
          ACCOUNT_ID: "act_74hfnjj",
          AMOUNT: 156.78,
          CURRENCY: "USD",
          DESCRIPTION: "AMAZON.COM AMZN.COM/BILL",
          MERCHANT: "Amazon",
          STATUS: "completed",
          CREATED_AT: "2025-06-23T09:15:00Z",
          CARD_LAST_4: "4567",
        },
        {
          ID: "txn_789",
          ACCOUNT_ID: "act_74hfnjj",
          AMOUNT: 45.32,
          CURRENCY: "USD",
          DESCRIPTION: "SHELL OIL #7890",
          MERCHANT: "Shell",
          STATUS: "completed",
          CREATED_AT: "2025-06-22T16:45:00Z",
          CARD_LAST_4: "4567",
        },
        {
          ID: "txn_101",
          ACCOUNT_ID: "act_74hfnjj",
          AMOUNT: 23.67,
          CURRENCY: "USD",
          DESCRIPTION: "STARBUCKS #5432",
          MERCHANT: "Starbucks",
          STATUS: "completed",
          CREATED_AT: "2025-06-21T07:30:00Z",
          CARD_LAST_4: "4567",
        },
      ];
    case "application":
      return [
        {
          ID: "app_123",
          CUSTOMER_ID: deps.store.context.user?.user_id,
          STATUS: "approved",
          CREATED_AT: "2023-01-01T00:00:00Z",
          UPDATED_AT: "2023-01-02T00:00:00Z",
          REASON: "Approved for credit limit increase",
        },
        {
          ID: "app_125",
          CUSTOMER_ID: deps.store.context.user?.user_id,
          STATUS: "open",
          CREATED_AT: "2025-01-01T00:00:00Z",
          UPDATED_AT: "2023-01-02T00:00:00Z",
          REASON: "Application missing W2 tax document",
        },
      ];
  }
  return "No entity found";
};

/****************************************************
 Get User By Email or Phone
****************************************************/
interface GetUserByEmailOrPhone {
  email?: string;
  phone?: string;
}

export const getUserByEmailOrPhone: ToolExecutor<
  GetUserByEmailOrPhone
> = async (args, deps) => {
  await sleep(600);
  if (!args.email && !args.phone) return;

  const _email = args.email?.toLowerCase().trim();
  const _phone = args.phone?.replace(/\D/g, "");
  const user = db.users.find((user) => {
    if (_email && user.email?.toLowerCase() === _email) return true;
    if (_phone && _phone === user.mobile_phone?.replace(/\D/g, "")) return true;

    return false;
  });

  if (user) deps.store.setContext({ user }); // set the user in the session context after successfully fetching
  return user;
};

/****************************************************
 Search Customer Transactions
****************************************************/
interface SearchCustomerTransactions {
  merchantName?: string;
  approximateAmount?: number;
}

export const searchCustomerTransactions: ToolExecutor<
  SearchCustomerTransactions
> = async (args, deps) => {
  await sleep(400);

  // Get all transactions using existing getEntity function
  const transactions = (await getEntity(
    { entity: "transaction" },
    deps
  )) as any[];

  if (!Array.isArray(transactions)) {
    return [];
  }

  let filteredTransactions = transactions;

  // Filter by merchant name (flexible matching)
  if (args.merchantName) {
    const merchantLower = args.merchantName.toLowerCase();
    filteredTransactions = filteredTransactions.filter(
      (txn) =>
        txn.MERCHANT?.toLowerCase().includes(merchantLower) ||
        txn.DESCRIPTION?.toLowerCase().includes(merchantLower)
    );
  }

  // Filter by approximate amount (flexible matching within 20% range)
  if (args.approximateAmount !== undefined) {
    const targetAmount = args.approximateAmount;
    const tolerance = targetAmount * 0.2; // 20% tolerance
    const minAmount = targetAmount - tolerance;
    const maxAmount = targetAmount + tolerance;

    filteredTransactions = filteredTransactions.filter(
      (txn) => txn.AMOUNT >= minAmount && txn.AMOUNT <= maxAmount
    );
  }

  // Sort by most recent first
  filteredTransactions.sort(
    (a, b) =>
      new Date(b.CREATED_AT).getTime() - new Date(a.CREATED_AT).getTime()
  );

  return filteredTransactions;
};

/****************************************************
 Create Dispute Case
****************************************************/
interface CreateDisputeCase {
  transactionId: string;
  reason: string;
  customerNotes?: string;
}

export const createDisputeCase: ToolExecutor<CreateDisputeCase> = async (
  args,
  deps
) => {
  await sleep(600);

  const user = deps.store.context.user;
  const transactions = (await getEntity(
    { entity: "transaction" },
    deps
  )) as any[];
  const transaction = Array.isArray(transactions)
    ? transactions.find((txn) => txn.ID === args.transactionId)
    : null;

  if (!transaction) {
    return "Error: Transaction not found";
  }

  const disputeCase = {
    id: `dispute_${Date.now()}`,
    customerId: user?.user_id,
    transactionId: args.transactionId,
    amount: transaction.AMOUNT,
    merchant: transaction.MERCHANT,
    description: transaction.DESCRIPTION,
    cardLast4: transaction.CARD_LAST_4,
    transactionDate: transaction.CREATED_AT,
    reason: args.reason,
    customerNotes: args.customerNotes || "",
    status: "pending_review",
    createdAt: new Date().toISOString(),
    customerProfile: {
      userId: user?.user_id,
      traits: user?.traits || {},
      phone: deps.store.context.call?.participantPhone,
    },
  };

  // Create auxiliary message to show case summary in UI
  const caseSummary = `DISPUTE CASE CREATED

Case ID: ${disputeCase.id}
Transaction: ${transaction.DESCRIPTION}
Amount: $${transaction.AMOUNT}
Date: ${new Date(transaction.CREATED_AT).toLocaleDateString()}
Card: ****${transaction.CARD_LAST_4}
Reason: ${args.reason}
${args.customerNotes ? `Customer Notes: ${args.customerNotes}` : ""}

Customer Profile Snapshot:
${Object.entries(user?.traits || {})
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

Status: Pending human agent review
Next Steps: Human agent will review case and contact customer within 1-2 business days`;

  const msg: AuxiliaryMessage = {
    body: caseSummary,
    channel: "email",
    createdAt: new Date().toISOString(),
    from: deps.store.context.company?.email as string,
    to: user?.traits?.email ?? "customer@example.com",
    id: uuidV4(),
  };

  deps.store.setContext({
    auxiliaryMessages: {
      ...(deps.store.context.auxiliaryMessages ?? {}),
      [msg.id]: msg,
    },
  });

  deps.log.info(
    "dispute-case-created",
    `Created dispute case ${disputeCase.id} for transaction ${args.transactionId}`
  );

  return disputeCase;
};

/****************************************************
 Transfer Dispute to Human Agent
****************************************************/
interface TransferDisputeToAgent {
  disputeCaseId: string;
  urgency?: "low" | "medium" | "high";
  customerNotes?: string;
}

export const transferDisputeToAgent: ToolExecutor<
  TransferDisputeToAgent
> = async (args, deps) => {
  await sleep(500);

  const user = deps.store.context.user;
  const disputeCase =
    deps.store.context.auxiliaryMessages &&
    Object.values(deps.store.context.auxiliaryMessages).find((msg) =>
      msg.body.includes(args.disputeCaseId)
    );

  // Create comprehensive handoff summary for dispute cases
  const disputeSummary = `CREDIT CARD DISPUTE TRANSFER

Case ID: ${args.disputeCaseId}
Customer: ${user?.user_id || "Unknown"}
Phone: ${deps.store.context.call?.participantPhone}
Urgency: ${args.urgency || "medium"}

DISPUTE DETAILS:
${disputeCase?.body || "Dispute case details not found"}

CONVERSATION CONTEXT:
${args.customerNotes || "Customer called regarding unrecognized charge"}

CUSTOMER PROFILE:
${Object.entries(user?.traits || {})
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

HISTORICAL CONTEXT:
${
  deps.store.context.historicalContext?.formattedContext ||
  "No previous history available"
}

NEXT STEPS:
- Review dispute case details
- Verify transaction information  
- Process dispute according to bank policies
- Contact customer within 1-2 business days with resolution`;

  // Use existing transfer tool with dispute-specific data
  return await transferToFlexAgent(
    {
      conversationSummary: disputeSummary,
    },
    deps
  );
};

/****************************************************
 Helpers
****************************************************/
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(() => resolve(true), ms));
}