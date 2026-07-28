export type BookingCopyPerspective = "customer" | "provider";

export type BookingCopyPreviewStyle =
  | "title"
  | "description"
  | "section"
  | "label"
  | "body"
  | "muted"
  | "callout"
  | "success"
  | "warning"
  | "error"
  | "button"
  | "secondary-button"
  | "placeholder";

export type BookingCopyField = {
  key: string;
  label: string;
  defaultValue: string;
  style: BookingCopyPreviewStyle;
};

export type BookingCopyRoute = {
  path: string;
  type?: "page" | "layout";
};

export type BookingCopyScreen = {
  id: string;
  perspective: BookingCopyPerspective;
  title: string;
  route: string;
  purpose: string;
  livePaths: readonly BookingCopyRoute[];
  fields: readonly BookingCopyField[];
};

/**
 * Generic, visible copy from the production web booking journey.
 *
 * Values may contain locked `{tokens}`. Admins can rewrite the surrounding
 * sentence, but saves must preserve the exact token set so preview fixtures
 * can never leak into live customer/provider pages and policy constants cannot
 * drift from the application behavior.
 */
export const BOOKING_COPY_SCREENS = [
  {
    id: "customer-request",
    perspective: "customer",
    title: "Request booking & schedule",
    route: "/book/[providerId]",
    purpose:
      "Choose the service, schedule, job details, flexibility, and authorize a first-hour card hold before sending a provider request.",
    livePaths: [{ path: "/book/[providerId]", type: "page" }],
    fields: [
      {
        key: "booking-customer.request.paused-title",
        label: "Requests paused title",
        defaultValue: "Booking requests open soon.",
        style: "warning",
      },
      {
        key: "booking-customer.request.paused-body",
        label: "Requests paused explanation",
        defaultValue:
          "Provider setup is underway, but customer requests are temporarily paused.",
        style: "body",
      },
      {
        key: "booking-customer.request.login-title",
        label: "Login required title",
        defaultValue: "Log in to send this request.",
        style: "callout",
      },
      {
        key: "booking-customer.request.admin-blocked",
        label: "Founder account explanation",
        defaultValue:
          "You're signed in as a founder. Founder accounts don't send booking requests.",
        style: "body",
      },
      {
        key: "booking-customer.request.own-listing",
        label: "Own listing explanation",
        defaultValue:
          "This is your own listing. You can book other providers, but not yourself.",
        style: "body",
      },
      {
        key: "booking-customer.request.setup-incomplete",
        label: "Provider setup explanation",
        defaultValue: "This provider is still completing booking setup.",
        style: "body",
      },
      {
        key: "booking-customer.request.service-label",
        label: "Service field",
        defaultValue: "Service",
        style: "label",
      },
      {
        key: "booking-customer.request.schedule-label",
        label: "Schedule field",
        defaultValue: "When do you need this?",
        style: "label",
      },
      {
        key: "booking-customer.request.schedule-hint",
        label: "Hourly schedule explanation",
        defaultValue:
          "Central Time. The range you pick is your estimate, billed in 15-minute increments with a one-hour minimum.",
        style: "muted",
      },
      {
        key: "booking-customer.request.quote-schedule-hint",
        label: "Flat-quote schedule explanation",
        defaultValue:
          "Central Time. The time you pick is when the provider comes out; your final price is their flat quote.",
        style: "muted",
      },
      {
        key: "booking-customer.request.response-label",
        label: "Response window field",
        defaultValue: "Provider response window",
        style: "label",
      },
      {
        key: "booking-customer.request.response-empty",
        label: "Response window empty option",
        defaultValue: "Choose an eligible start time first",
        style: "placeholder",
      },
      {
        key: "booking-customer.request.response-hint",
        label: "Response window explanation",
        defaultValue:
          "If there is no response by then, your request stays open and we show optional replacements.",
        style: "muted",
      },
      {
        key: "booking-customer.request.flexibility-label",
        label: "Time flexibility heading",
        defaultValue: "If your student is busy at that exact time",
        style: "section",
      },
      {
        key: "booking-customer.request.flexible-title",
        label: "Flexible-time option",
        defaultValue: "They can suggest a different time",
        style: "label",
      },
      {
        key: "booking-customer.request.flexible-body",
        label: "Flexible-time explanation",
        defaultValue:
          "You decide whether to take it. Nothing is charged while you decide, and your hold stays put.",
        style: "muted",
      },
      {
        key: "booking-customer.request.fixed-title",
        label: "Fixed-time option",
        defaultValue: "This time only",
        style: "label",
      },
      {
        key: "booking-customer.request.fixed-body",
        label: "Fixed-time explanation",
        defaultValue:
          "They can accept or decline the time you picked, nothing else.",
        style: "muted",
      },
      {
        key: "booking-customer.request.details-label",
        label: "Job details field",
        defaultValue: "Job details",
        style: "label",
      },
      {
        key: "booking-customer.request.details-placeholder",
        label: "Job details placeholder",
        defaultValue:
          "Size of the job, access notes, pets, or supplies needed...",
        style: "placeholder",
      },
      {
        key: "booking-customer.request.quote-details-placeholder",
        label: "Flat-quote details placeholder",
        defaultValue:
          "Describe the size or quantity, surfaces or items, access, and anything that affects the scope...",
        style: "placeholder",
      },
      {
        key: "booking-customer.request.photo-label",
        label: "Job photos field",
        defaultValue: "Job site photos",
        style: "label",
      },
      {
        key: "booking-customer.request.photo-required",
        label: "Required photos marker",
        defaultValue: "(required)",
        style: "muted",
      },
      {
        key: "booking-customer.request.photo-uploading",
        label: "Photo uploading state",
        defaultValue: "Uploading",
        style: "muted",
      },
      {
        key: "booking-customer.request.photo-upload-failed",
        label: "Photo upload failure",
        defaultValue: "Upload failed",
        style: "error",
      },
      {
        key: "booking-customer.request.photo-add",
        label: "Add photos button",
        defaultValue: "Add photos",
        style: "secondary-button",
      },
      {
        key: "booking-customer.request.photo-add-more",
        label: "Add more photos button",
        defaultValue: "Add more",
        style: "secondary-button",
      },
      {
        key: "booking-customer.request.photo-empty-hint",
        label: "Photo guidance",
        defaultValue:
          "Show the space, the items, and how a truck or hose would reach them. Up to {max_photos} photos, {max_mb} MB each.",
        style: "muted",
      },
      {
        key: "booking-customer.request.photo-ready-hint",
        label: "Photos ready message",
        defaultValue:
          "{ready_count} of {max_photos} photos ready. Your student sees these with the request.",
        style: "success",
      },
      {
        key: "booking-customer.request.photo-capacity-error",
        label: "Photo limit error",
        defaultValue: "Attach up to {max_photos} photos.",
        style: "error",
      },
      {
        key: "booking-customer.request.photo-truncated-error",
        label: "Extra photos error",
        defaultValue:
          "Only the first {added_count} {photo_word} were added. {max_photos} is the maximum.",
        style: "error",
      },
      {
        key: "booking-customer.request.photo-generic-error",
        label: "Generic upload error",
        defaultValue: "Upload failed.",
        style: "error",
      },
      {
        key: "booking-customer.request.quote-pricing-label",
        label: "Flat-quote pricing row",
        defaultValue: "Pricing",
        style: "label",
      },
      {
        key: "booking-customer.request.quote-required",
        label: "Flat-quote price state",
        defaultValue: "Quote required",
        style: "muted",
      },
      {
        key: "booking-customer.request.quote-media-title",
        label: "Flat-quote media title",
        defaultValue: "Your photos decide the price.",
        style: "warning",
      },
      {
        key: "booking-customer.request.quote-media-body",
        label: "Flat-quote media explanation",
        defaultValue:
          "Your student quotes from the photos above, so show anything that changes the work. Once you send the request they're fixed, but you can share more in the private booking chat.",
        style: "body",
      },
      {
        key: "booking-customer.request.quote-policy",
        label: "Flat-quote payment explanation",
        defaultValue:
          "You are not charged when requesting a quote. The provider reviews the job and sends a final flat price. You choose whether to confirm and pay that price. College Crew's {platform_fee_percent}% fee comes from provider earnings, with no added customer platform fee.",
        style: "callout",
      },
      {
        key: "booking-customer.request.hourly-rate-label",
        label: "Hourly rate row",
        defaultValue: "Hourly rate",
        style: "label",
      },
      {
        key: "booking-customer.request.estimate-label",
        label: "Estimate row",
        defaultValue: "Estimated subtotal",
        style: "label",
      },
      {
        key: "booking-customer.request.hold-label",
        label: "Hold row",
        defaultValue: "First-hour authorization",
        style: "label",
      },
      {
        key: "booking-customer.request.hold-policy",
        label: "Hold and billing explanation",
        defaultValue:
          "We authorize a hold on your card for the first hour now. Your student has {response_hours} hours to accept—if they accept, we charge the first hour; if they decline or time out, we release the authorization and you are not charged. Final billing uses the provider's submitted actual time, rounded to {billing_increment}-minute increments. College Crew's fee comes from provider earnings; there is no added customer platform fee.",
        style: "callout",
      },
      {
        key: "booking-customer.request.payments-title",
        label: "Payments unavailable title",
        defaultValue: "Payments aren't live yet.",
        style: "warning",
      },
      {
        key: "booking-customer.request.payments-body",
        label: "Payments unavailable explanation",
        defaultValue:
          "Stripe isn't configured in this environment. This will run the real test-mode authorization once it is.",
        style: "body",
      },
      {
        key: "booking-customer.request.continue-button",
        label: "Continue button",
        defaultValue: "Continue to authorize {hold_amount}",
        style: "button",
      },
      {
        key: "booking-customer.request.continue-pending",
        label: "Continue loading label",
        defaultValue: "Preparing authorization...",
        style: "button",
      },
      {
        key: "booking-customer.request.quote-submit",
        label: "Request flat quote button",
        defaultValue: "Request flat quote",
        style: "button",
      },
      {
        key: "booking-customer.request.quote-photo-required",
        label: "Missing photo button",
        defaultValue: "Add a job site photo to continue",
        style: "button",
      },
      {
        key: "booking-customer.request.quote-pending",
        label: "Request quote loading label",
        defaultValue: "Sending request...",
        style: "button",
      },
      {
        key: "booking-customer.request.hold-intro",
        label: "Card hold explanation",
        defaultValue:
          "We'll authorize a {hold_amount} hold for the first hour. You're charged only if your student accepts.",
        style: "body",
      },
      {
        key: "booking-customer.request.hold-submit",
        label: "Place hold button",
        defaultValue: "Authorize {hold_amount} hold & request",
        style: "button",
      },
      {
        key: "booking-customer.request.hold-error",
        label: "Card hold error",
        defaultValue: "First-hour authorization didn't go through. Please try again.",
        style: "error",
      },
    ],
  },
  {
    id: "customer-demo-request",
    perspective: "customer",
    title: "Sample booking request",
    route: "/book/demo",
    purpose:
      "Preview and submit a founder/admin-only sample request without creating a real booking or payment.",
    livePaths: [{ path: "/book/demo" }],
    fields: [
      {
        key: "booking-customer.demo-request.description",
        label: "Page description",
        defaultValue: "Sample booking request",
        style: "description",
      },
      {
        key: "booking-customer.demo-request.service-label",
        label: "Service field",
        defaultValue: "Service",
        style: "label",
      },
      {
        key: "booking-customer.demo-request.schedule-label",
        label: "Schedule field",
        defaultValue: "When do you need this?",
        style: "label",
      },
      {
        key: "booking-customer.demo-request.calendar-label",
        label: "Calendar accessibility label",
        defaultValue: "Choose a date to book",
        style: "muted",
      },
      {
        key: "booking-customer.demo-request.response-label",
        label: "Response window field",
        defaultValue: "Response window",
        style: "label",
      },
      {
        key: "booking-customer.demo-request.address-label",
        label: "Address field",
        defaultValue: "Address",
        style: "label",
      },
      {
        key: "booking-customer.demo-request.zip-label",
        label: "ZIP field",
        defaultValue: "Job ZIP",
        style: "label",
      },
      {
        key: "booking-customer.demo-request.details-label",
        label: "Details field",
        defaultValue: "Details",
        style: "label",
      },
      {
        key: "booking-customer.demo-request.rate-label",
        label: "Hourly rate row",
        defaultValue: "Hourly rate",
        style: "label",
      },
      {
        key: "booking-customer.demo-request.policy-note",
        label: "Sample billing explanation",
        defaultValue:
          "One-hour minimum, then 15-minute increments. After acceptance, the first hour is due; final billing uses actual submitted time. This sample submit only returns to the dashboard.",
        style: "callout",
      },
      {
        key: "booking-customer.demo-request.submit",
        label: "Submit button",
        defaultValue: "Send sample request",
        style: "button",
      },
      {
        key: "booking-customer.demo-request.back",
        label: "Back button",
        defaultValue: "Back to dashboard",
        style: "secondary-button",
      },
    ],
  },
  {
    id: "customer-demo-confirm",
    perspective: "customer",
    title: "Sample confirmation & payment",
    route: "/bookings/demo/confirm",
    purpose:
      "Preview the founder/admin-only confirmation and payment step without creating a PaymentIntent or charging a card.",
    livePaths: [{ path: "/bookings/demo/confirm" }],
    fields: [
      {
        key: "booking-customer.demo-confirm.title",
        label: "Page title",
        defaultValue: "Confirm & pay",
        style: "title",
      },
      {
        key: "booking-customer.demo-confirm.description",
        label: "Page description",
        defaultValue: "Sample accepted booking details before payment.",
        style: "description",
      },
      {
        key: "booking-customer.demo-confirm.service-label",
        label: "Service row",
        defaultValue: "Service",
        style: "label",
      },
      {
        key: "booking-customer.demo-confirm.provider-label",
        label: "Provider row",
        defaultValue: "Provider",
        style: "label",
      },
      {
        key: "booking-customer.demo-confirm.when-label",
        label: "Schedule row",
        defaultValue: "When",
        style: "label",
      },
      {
        key: "booking-customer.demo-confirm.where-label",
        label: "Address row",
        defaultValue: "Where",
        style: "label",
      },
      {
        key: "booking-customer.demo-confirm.price-label",
        label: "Price row",
        defaultValue: "Price",
        style: "label",
      },
      {
        key: "booking-customer.demo-confirm.notice",
        label: "Demo payment explanation",
        defaultValue:
          "This demo does not create a Stripe PaymentIntent or charge a card.",
        style: "callout",
      },
      {
        key: "booking-customer.demo-confirm.submit",
        label: "Confirm button",
        defaultValue: "Confirm sample payment",
        style: "button",
      },
      {
        key: "booking-customer.demo-confirm.back",
        label: "Back button",
        defaultValue: "Back to dashboard",
        style: "secondary-button",
      },
    ],
  },
  {
    id: "customer-dashboard",
    perspective: "customer",
    title: "Bookings dashboard & cancellation",
    route: "/dashboard",
    purpose:
      "Track requests and scheduled work, respond to attention states, cancel, rebook, report problems, and leave reviews.",
    livePaths: [{ path: "/dashboard" }],
    fields: [
      {
        key: "booking-customer.dashboard.title",
        label: "Page title",
        defaultValue: "My bookings",
        style: "title",
      },
      {
        key: "booking-customer.dashboard.request-sent",
        label: "Request sent confirmation",
        defaultValue:
          "Request sent. The provider will accept or decline; once they accept, you'll confirm and pay here.",
        style: "success",
      },
      {
        key: "booking-customer.dashboard.quote-request-sent",
        label: "Quote request confirmation",
        defaultValue:
          "Quote requested. Use the private chat to share any images, videos, or details the provider needs. You will review the final flat price before paying.",
        style: "success",
      },
      {
        key: "booking-customer.dashboard.booking-confirmed",
        label: "Booking confirmed message",
        defaultValue: "Booking confirmed. You're on the schedule.",
        style: "success",
      },
      {
        key: "booking-customer.dashboard.needs-attention",
        label: "Attention section",
        defaultValue: "Needs attention",
        style: "section",
      },
      {
        key: "booking-customer.dashboard.awaiting-review",
        label: "Review section heading",
        defaultValue: "How did the job go?",
        style: "section",
      },
      {
        key: "booking-customer.dashboard.scheduled",
        label: "Scheduled section",
        defaultValue: "Scheduled",
        style: "section",
      },
      {
        key: "booking-customer.dashboard.empty-title",
        label: "Empty state title",
        defaultValue: "Nothing booked yet",
        style: "section",
      },
      {
        key: "booking-customer.dashboard.empty-body",
        label: "Empty state explanation",
        defaultValue: "Find a verified student and send your first request.",
        style: "muted",
      },
      {
        key: "booking-customer.dashboard.response-passed",
        label: "Response deadline message",
        defaultValue: "The response deadline has passed.",
        style: "warning",
      },
      {
        key: "booking-customer.dashboard.quote-waiting",
        label: "Waiting-for-quote label",
        defaultValue: "Waiting for flat quote",
        style: "muted",
      },
      {
        key: "booking-customer.dashboard.quote-media-note",
        label: "Quote media reminder",
        defaultValue:
          "Your student quotes from these photos. They may ask for more in the private chat before sending the final flat quote.",
        style: "callout",
      },
      {
        key: "booking-customer.dashboard.photo-label",
        label: "Submitted photos heading",
        defaultValue: "Photos you sent",
        style: "section",
      },
      {
        key: "booking-customer.dashboard.photos-unavailable",
        label: "Unavailable photos message",
        defaultValue: "These photos are no longer available to you.",
        style: "muted",
      },
      {
        key: "booking-customer.dashboard.balance-attention",
        label: "Balance problem message",
        defaultValue: "Your balance payment needs attention.",
        style: "error",
      },
      {
        key: "booking-customer.dashboard.review-pay",
        label: "Review invoice button",
        defaultValue: "Review & pay",
        style: "button",
      },
      {
        key: "booking-customer.dashboard.report-no-show",
        label: "No-show button",
        defaultValue: "Report a no-show",
        style: "secondary-button",
      },
      {
        key: "booking-customer.dashboard.report-problem",
        label: "Problem button",
        defaultValue: "Report a problem",
        style: "secondary-button",
      },
      {
        key: "booking-customer.dashboard.cancel-booking",
        label: "Cancel booked job button",
        defaultValue: "Cancel booking",
        style: "secondary-button",
      },
      {
        key: "booking-customer.dashboard.cancel-request",
        label: "Cancel open request button",
        defaultValue: "Cancel request",
        style: "secondary-button",
      },
      {
        key: "booking-customer.dashboard.cancel-full-refund",
        label: "Full-refund cancellation result",
        defaultValue: "You'll be fully refunded.",
        style: "success",
      },
      {
        key: "booking-customer.dashboard.cancel-late",
        label: "Late cancellation result",
        defaultValue:
          "Less than {cancellation_hours} hours before the start, so the first-hour charge isn't refundable.",
        style: "warning",
      },
      {
        key: "booking-customer.dashboard.cancel-no-payment",
        label: "Unpaid cancellation result",
        defaultValue: "Nothing has been charged yet.",
        style: "muted",
      },
      {
        key: "booking-customer.dashboard.review-placeholder",
        label: "Review placeholder",
        defaultValue: "A sentence or two helps the next neighbor…",
        style: "placeholder",
      },
      {
        key: "booking-customer.dashboard.review-submit",
        label: "Review button",
        defaultValue: "Leave review",
        style: "button",
      },
    ],
  },
  {
    id: "customer-counter",
    perspective: "customer",
    title: "Provider suggested a new time",
    route: "/bookings/[id]/counter",
    purpose:
      "Compare the requested time with a provider's proposed time, then accept it or look for another provider.",
    livePaths: [{ path: "/bookings/[id]/counter", type: "page" }],
    fields: [
      {
        key: "booking-customer.counter.title",
        label: "Page title",
        defaultValue: "A new time was suggested",
        style: "title",
      },
      {
        key: "booking-customer.counter.closed",
        label: "Closed-state explanation",
        defaultValue: "This request isn't waiting on a time decision anymore.",
        style: "muted",
      },
      {
        key: "booking-customer.counter.requested-label",
        label: "Original time label",
        defaultValue: "You asked for",
        style: "label",
      },
      {
        key: "booking-customer.counter.proposed-label",
        label: "Proposed time label",
        defaultValue: "{provider_name} can do",
        style: "label",
      },
      {
        key: "booking-customer.counter.hold-note",
        label: "Hold explanation",
        defaultValue:
          "Nothing has been charged. Your {hold_amount} hold is still in place—accepting charges that first hour and books the job at the new time. Turning it down releases the hold and shows you other available students.",
        style: "callout",
      },
      {
        key: "booking-customer.counter.accept",
        label: "Accept button",
        defaultValue: "Accept the new time",
        style: "button",
      },
      {
        key: "booking-customer.counter.reject",
        label: "Reject button",
        defaultValue: "No thanks—show me other students",
        style: "secondary-button",
      },
    ],
  },
  {
    id: "customer-replacement",
    perspective: "customer",
    title: "Replacement provider",
    route: "/bookings/[id]/replace",
    purpose:
      "Choose another provider after a missed response, decline, or provider cancellation while preserving the job details.",
    livePaths: [{ path: "/bookings/[id]/replace", type: "page" }],
    fields: [
      {
        key: "booking-customer.replace.title",
        label: "Page title",
        defaultValue: "Pick another student",
        style: "title",
      },
      {
        key: "booking-customer.replace.waiting",
        label: "Not-yet-available explanation",
        defaultValue:
          "Replacement suggestions appear if the provider has not responded by the deadline.",
        style: "muted",
      },
      {
        key: "booking-customer.replace.unavailable",
        label: "Unavailable explanation",
        defaultValue: "This request can't be replaced right now.",
        style: "muted",
      },
      {
        key: "booking-customer.replace.time-change-title",
        label: "Time change warning",
        defaultValue: "This changes your job time.",
        style: "warning",
      },
      {
        key: "booking-customer.replace.other-students",
        label: "Fallback provider heading",
        defaultValue: "Other students who do this",
        style: "section",
      },
      {
        key: "booking-customer.replace.fallback-note",
        label: "Fallback provider explanation",
        defaultValue:
          "No opening matched your job, so you'd pick a new time with them directly.",
        style: "muted",
      },
      {
        key: "booking-customer.replace.continue",
        label: "Continue button",
        defaultValue: "Continue",
        style: "button",
      },
      {
        key: "booking-customer.replace.hold-submit",
        label: "Replacement hold button",
        defaultValue: "Authorize {hold_amount} hold & request",
        style: "button",
      },
      {
        key: "booking-customer.replace.hold-error",
        label: "Replacement hold error",
        defaultValue: "First-hour authorization didn't go through. Please try again.",
        style: "error",
      },
    ],
  },
  {
    id: "customer-confirm",
    perspective: "customer",
    title: "Confirm & first-hour payment",
    route: "/bookings/[id]/confirm",
    purpose:
      "Review an accepted booking, accept required terms, and pay the first hour before the payment deadline.",
    livePaths: [
      { path: "/bookings/[id]/confirm", type: "page" },
      { path: "/bookings/[id]/invoice", type: "page" },
    ],
    fields: [
      {
        key: "booking-customer.confirm.title",
        label: "Page title",
        defaultValue: "Confirm & pay the first hour",
        style: "title",
      },
      {
        key: "booking-customer.confirm.full-price-title",
        label: "Full-price page title",
        defaultValue: "Confirm & pay",
        style: "title",
      },
      {
        key: "booking-customer.confirm.quote-description",
        label: "Flat-quote page explanation",
        defaultValue:
          "Your provider sent a final flat quote. Review the exact price and booking details before paying.",
        style: "description",
      },
      {
        key: "booking-customer.confirm.fixed-description",
        label: "Fixed-price page explanation",
        defaultValue:
          "The provider accepted your request. Confirm the details below to lock it in.",
        style: "description",
      },
      {
        key: "booking-customer.confirm.full-price-fee-note",
        label: "Full-price fee explanation",
        defaultValue:
          "You pay the price shown. College Crew's platform fee comes out of the provider's earnings, with no added customer platform fee.",
        style: "muted",
      },
      {
        key: "booking-customer.confirm.quote-waiting",
        label: "Waiting-for-quote explanation",
        defaultValue:
          "Still waiting on the provider's final quote. They may request images or video in the private chat first.",
        style: "muted",
      },
      {
        key: "booking-customer.confirm.provider-waiting",
        label: "Waiting-for-provider explanation",
        defaultValue:
          "Still waiting on the provider. You'll be able to confirm and pay once they accept.",
        style: "muted",
      },
      {
        key: "booking-customer.confirm.description",
        label: "Page explanation",
        defaultValue:
          "Your provider accepted. Pay the first hour to lock in the booking; the rest is billed by actual time after the job.",
        style: "description",
      },
      {
        key: "booking-customer.confirm.payment-heading",
        label: "Payment section",
        defaultValue: "Payment",
        style: "section",
      },
      {
        key: "booking-customer.confirm.rate-label",
        label: "Rate row",
        defaultValue: "Rate",
        style: "label",
      },
      {
        key: "booking-customer.confirm.estimate-label",
        label: "Estimated time row",
        defaultValue: "Estimated time",
        style: "label",
      },
      {
        key: "booking-customer.confirm.first-hour-label",
        label: "First-hour row",
        defaultValue: "First-hour payment now",
        style: "label",
      },
      {
        key: "booking-customer.confirm.total-label",
        label: "Estimated total row",
        defaultValue: "Estimated total",
        style: "label",
      },
      {
        key: "booking-customer.confirm.payment-explanation",
        label: "Payment explanation",
        defaultValue:
          "You pay {first_hour_amount} now for the first hour. Your card charges the remaining balance for this booking only once the provider submits actual time.",
        style: "callout",
      },
      {
        key: "booking-customer.confirm.invoice-policy",
        label: "Invoice timing",
        defaultValue:
          "With no confirmation or dispute, the remaining balance is charged {invoice_hours} hours after the invoice is submitted.",
        style: "muted",
      },
      {
        key: "booking-customer.confirm.cancellation-policy",
        label: "Cancellation explanation",
        defaultValue:
          "Cancel {cancellation_hours}+ hours before the start for a full refund; a later cancellation keeps the first hour. Concerns after arrival are handled as a dispute.",
        style: "muted",
      },
      {
        key: "booking-customer.confirm.payment-received",
        label: "Payment received state",
        defaultValue:
          "Payment received. Finalizing your booking. Refresh in a moment.",
        style: "success",
      },
      {
        key: "booking-customer.confirm.window-closed-title",
        label: "Expired payment title",
        defaultValue: "The first-hour payment window closed.",
        style: "warning",
      },
      {
        key: "booking-customer.confirm.window-closed-body",
        label: "Expired payment explanation",
        defaultValue:
          "This request will be released. Send a new request to book this service.",
        style: "body",
      },
      {
        key: "booking-customer.confirm.pay-button",
        label: "Payment button",
        defaultValue: "Pay first hour ({first_hour_amount})",
        style: "button",
      },
      {
        key: "booking-customer.confirm.pay-pending",
        label: "Payment loading label",
        defaultValue: "Preparing payment…",
        style: "button",
      },
      {
        key: "booking-customer.confirm.booked",
        label: "Booked confirmation",
        defaultValue:
          "First hour paid. You're on the schedule. You'll see the final invoice here after the job.",
        style: "success",
      },
      {
        key: "booking-customer.confirm.invoice-ready",
        label: "Invoice-ready explanation",
        defaultValue:
          "The provider submitted the final invoice. Review it and pay the remaining balance.",
        style: "callout",
      },
      {
        key: "booking-customer.confirm.invoice-button",
        label: "Invoice button",
        defaultValue: "Review & pay",
        style: "button",
      },
      {
        key: "booking-customer.confirm.underway",
        label: "Underway state",
        defaultValue:
          "This booking is already underway. Track it from your dashboard.",
        style: "muted",
      },
      {
        key: "booking-customer.confirm.payments-title",
        label: "Payments unavailable title",
        defaultValue: "Payments aren't live yet.",
        style: "warning",
      },
      {
        key: "booking-customer.confirm.payments-body",
        label: "Payments unavailable explanation",
        defaultValue:
          "Stripe isn't configured in this environment. This button will run the real test-mode payment once it is.",
        style: "body",
      },
      {
        key: "booking-customer.confirm.card-error",
        label: "Card payment error",
        defaultValue: "Payment didn't go through. Please try again.",
        style: "error",
      },
      {
        key: "booking-customer.confirm.pay-now",
        label: "Final card button",
        defaultValue: "Pay now",
        style: "button",
      },
    ],
  },
  {
    id: "customer-invoice",
    perspective: "customer",
    title: "Invoice & final payment",
    route: "/bookings/[id]/invoice",
    purpose:
      "Compare estimated and actual time, review the final balance, pay or update a payment method, and see settlement status.",
    livePaths: [{ path: "/bookings/[id]/invoice", type: "page" }],
    fields: [
      {
        key: "booking-customer.invoice.title",
        label: "Page title",
        defaultValue: "Invoice",
        style: "title",
      },
      {
        key: "booking-customer.invoice.arrived-label",
        label: "Arrival row",
        defaultValue: "Arrived",
        style: "label",
      },
      {
        key: "booking-customer.invoice.completed-label",
        label: "Completion row",
        defaultValue: "Completed",
        style: "label",
      },
      {
        key: "booking-customer.invoice.booked-label",
        label: "Estimated-time row",
        defaultValue: "You booked",
        style: "label",
      },
      {
        key: "booking-customer.invoice.actual-label",
        label: "Actual-time row",
        defaultValue: "Actually worked",
        style: "label",
      },
      {
        key: "booking-customer.invoice.difference-label",
        label: "Difference row",
        defaultValue: "Difference",
        style: "label",
      },
      {
        key: "booking-customer.invoice.first-hour-label",
        label: "First-hour payment row",
        defaultValue: "First hour already paid",
        style: "label",
      },
      {
        key: "booking-customer.invoice.balance-label",
        label: "Balance row",
        defaultValue: "Remaining balance",
        style: "label",
      },
      {
        key: "booking-customer.invoice.over-estimate",
        label: "Extra-time explanation heading",
        defaultValue: "Time beyond the estimate",
        style: "warning",
      },
      {
        key: "booking-customer.invoice.fee-note",
        label: "Platform fee explanation",
        defaultValue:
          "The {platform_fee_percent}% platform fee comes out of the provider's payout; the amount above is all you pay.",
        style: "muted",
      },
      {
        key: "booking-customer.invoice.paid",
        label: "Paid state",
        defaultValue: "Paid in full",
        style: "success",
      },
      {
        key: "booking-customer.invoice.processing-title",
        label: "Processing title",
        defaultValue: "Payment processing.",
        style: "callout",
      },
      {
        key: "booking-customer.invoice.processing-body",
        label: "Processing explanation",
        defaultValue: "This updates to Completed once it settles.",
        style: "muted",
      },
      {
        key: "booking-customer.invoice.autocharge-label",
        label: "Autocharge countdown",
        defaultValue: "Auto-charges the saved card",
        style: "warning",
      },
      {
        key: "booking-customer.invoice.complete",
        label: "Zero-balance completion",
        defaultValue: "All set! The job is complete.",
        style: "success",
      },
      {
        key: "booking-customer.invoice.complete-body",
        label: "Completion explanation",
        defaultValue: "You can leave a review from your bookings.",
        style: "muted",
      },
      {
        key: "booking-customer.invoice.confirm-button",
        label: "Confirm invoice button",
        defaultValue: "Confirm & complete",
        style: "button",
      },
      {
        key: "booking-customer.invoice.payment-failed",
        label: "Failed payment title",
        defaultValue: "That payment didn't go through.",
        style: "error",
      },
      {
        key: "booking-customer.invoice.update-payment",
        label: "Update payment button",
        defaultValue: "Update payment method",
        style: "button",
      },
    ],
  },
  {
    id: "customer-dispute",
    perspective: "customer",
    title: "Cancellation, no-show & dispute",
    route: "/bookings/[id]/dispute",
    purpose:
      "Report a no-show or billing/service problem, then track founder review and the final resolution.",
    livePaths: [{ path: "/bookings/[id]/dispute", type: "page" }],
    fields: [
      {
        key: "booking-customer.dispute.title",
        label: "New dispute title",
        defaultValue: "Report a problem",
        style: "title",
      },
      {
        key: "booking-customer.dispute.existing-title",
        label: "Existing dispute title",
        defaultValue: "Your dispute",
        style: "title",
      },
      {
        key: "booking-customer.dispute.opened",
        label: "Submitted confirmation",
        defaultValue:
          "Thanks. A founder will review this and follow up. Payment is paused while it's open.",
        style: "success",
      },
      {
        key: "booking-customer.dispute.under-review",
        label: "Open status",
        defaultValue: "Under review",
        style: "warning",
      },
      {
        key: "booking-customer.dispute.resolved",
        label: "Resolved status",
        defaultValue: "Resolved",
        style: "success",
      },
      {
        key: "booking-customer.dispute.report-label",
        label: "Report summary label",
        defaultValue: "Your report",
        style: "label",
      },
      {
        key: "booking-customer.dispute.ineligible",
        label: "Unavailable explanation",
        defaultValue:
          "This booking can't be disputed right now. Disputes are available while a job is underway, during invoice review, for a no-show after the start time, or for seven days after the final payment.",
        style: "muted",
      },
      {
        key: "booking-customer.dispute.issue-label",
        label: "Issue field",
        defaultValue: "What's the issue?",
        style: "label",
      },
      {
        key: "booking-customer.dispute.no-show-option",
        label: "No-show option",
        defaultValue: "The provider never showed up",
        style: "body",
      },
      {
        key: "booking-customer.dispute.hours-option",
        label: "Hours option",
        defaultValue: "The billed time is wrong",
        style: "body",
      },
      {
        key: "booking-customer.dispute.service-option",
        label: "Service option",
        defaultValue: "The work wasn't done as agreed",
        style: "body",
      },
      {
        key: "booking-customer.dispute.payment-option",
        label: "Payment option",
        defaultValue: "A payment or charge problem",
        style: "body",
      },
      {
        key: "booking-customer.dispute.cancellation-option",
        label: "Cancellation option",
        defaultValue: "A cancellation problem",
        style: "body",
      },
      {
        key: "booking-customer.dispute.other-option",
        label: "Other option",
        defaultValue: "Something else",
        style: "body",
      },
      {
        key: "booking-customer.dispute.placeholder",
        label: "Report placeholder",
        defaultValue:
          "Describe the problem in your own words. A founder reviews every dispute personally.",
        style: "placeholder",
      },
      {
        key: "booking-customer.dispute.submit",
        label: "Submit button",
        defaultValue: "Submit for review",
        style: "button",
      },
    ],
  },
  {
    id: "provider-dashboard",
    perspective: "provider",
    title: "Requests dashboard",
    route: "/provider/dashboard",
    purpose:
      "Review incoming booking requests and accept, decline, quote, or suggest a different time.",
    livePaths: [{ path: "/provider/dashboard" }],
    fields: [
      {
        key: "booking-provider.dashboard.title",
        label: "Page title",
        defaultValue: "Dashboard",
        style: "title",
      },
      {
        key: "booking-provider.dashboard.description",
        label: "Page explanation",
        defaultValue: "Requests, earnings, and your month at a glance.",
        style: "description",
      },
      {
        key: "booking-provider.dashboard.no-requests",
        label: "Empty state title",
        defaultValue: "No new requests",
        style: "section",
      },
      {
        key: "booking-provider.dashboard.no-requests-body",
        label: "Empty state explanation",
        defaultValue:
          "Booking requests land here—accept or decline, and the customer pays after you accept.",
        style: "muted",
      },
      {
        key: "booking-provider.dashboard.reserved",
        label: "Accepted request explanation",
        defaultValue:
          "Reserved. The customer must pay the first hour to confirm.",
        style: "callout",
      },
      {
        key: "booking-provider.dashboard.accept",
        label: "Accept button",
        defaultValue: "Accept",
        style: "button",
      },
      {
        key: "booking-provider.dashboard.quote-start",
        label: "Start quote button",
        defaultValue: "Send quote",
        style: "button",
      },
      {
        key: "booking-provider.dashboard.quote-title",
        label: "Quote panel title",
        defaultValue: "Send a final flat quote",
        style: "section",
      },
      {
        key: "booking-provider.dashboard.quote-body",
        label: "Quote panel explanation",
        defaultValue:
          "Review the job and any images or video first. Once sent, this price cannot be edited for this request.",
        style: "body",
      },
      {
        key: "booking-provider.dashboard.photo-label",
        label: "Customer photos heading",
        defaultValue: "Job site photos",
        style: "section",
      },
      {
        key: "booking-provider.dashboard.photos-unavailable",
        label: "Unavailable photos message",
        defaultValue: "These photos are no longer available to you.",
        style: "muted",
      },
      {
        key: "booking-provider.dashboard.quote-chat",
        label: "Open media chat button",
        defaultValue: "Open chat for media",
        style: "secondary-button",
      },
      {
        key: "booking-provider.dashboard.quote-label",
        label: "Final quote field",
        defaultValue: "Final quote",
        style: "label",
      },
      {
        key: "booking-provider.dashboard.quote-hint",
        label: "Quote payout explanation",
        defaultValue:
          "The customer pays this exact amount. College Crew's {platform_fee_percent}% fee comes from your payout.",
        style: "muted",
      },
      {
        key: "booking-provider.dashboard.quote-submit",
        label: "Send final quote button",
        defaultValue: "Send final quote",
        style: "button",
      },
      {
        key: "booking-provider.dashboard.counter-placeholder",
        label: "Counter-time note placeholder",
        defaultValue: "Optional: a quick word on why this time works better",
        style: "placeholder",
      },
      {
        key: "booking-provider.dashboard.counter-submit",
        label: "Counter-time button",
        defaultValue: "Suggest this time",
        style: "button",
      },
      {
        key: "booking-provider.dashboard.decline-placeholder",
        label: "Decline note placeholder",
        defaultValue:
          "For example: I can't make that time, but I could do Saturday morning if you want to send a new request.",
        style: "placeholder",
      },
      {
        key: "booking-provider.dashboard.decline-submit",
        label: "Decline button",
        defaultValue: "Send note & decline",
        style: "secondary-button",
      },
      {
        key: "booking-provider.dashboard.accepting",
        label: "Accept loading label",
        defaultValue: "Accepting…",
        style: "button",
      },
    ],
  },
  {
    id: "provider-jobs",
    perspective: "provider",
    title: "Jobs, arrival & cancellation",
    route: "/provider/jobs",
    purpose:
      "Track upcoming work, notify the customer when traveling, mark arrival, and cancel when necessary.",
    livePaths: [{ path: "/provider/jobs" }],
    fields: [
      {
        key: "booking-provider.jobs.title",
        label: "Page title",
        defaultValue: "Jobs",
        style: "title",
      },
      {
        key: "booking-provider.jobs.description",
        label: "Page explanation",
        defaultValue:
          "Your upcoming jobs, and the pricing customers currently see.",
        style: "description",
      },
      {
        key: "booking-provider.jobs.empty-title",
        label: "Empty state title",
        defaultValue: "No jobs on the books",
        style: "section",
      },
      {
        key: "booking-provider.jobs.empty-body",
        label: "Empty state explanation",
        defaultValue:
          "Accepted and paid bookings show up here with everything you need to show up and get it done.",
        style: "muted",
      },
      {
        key: "booking-provider.jobs.on-way-confirm",
        label: "On-my-way confirmation",
        defaultValue: "Notify the customer that you are on the way?",
        style: "callout",
      },
      {
        key: "booking-provider.jobs.cancel-placeholder",
        label: "Cancellation reason placeholder",
        defaultValue: "For example: Family emergency—can't make it.",
        style: "placeholder",
      },
      {
        key: "booking-provider.jobs.cancel-submit",
        label: "Cancellation button",
        defaultValue: "Confirm cancellation",
        style: "secondary-button",
      },
    ],
  },
  {
    id: "provider-invoice",
    perspective: "provider",
    title: "Complete job & submit invoice",
    route: "/provider/jobs/[id]/complete",
    purpose:
      "Enter actual billable time, explain overages, record cash settlement when applicable, and submit the final invoice.",
    livePaths: [{ path: "/provider/jobs/[id]/complete", type: "page" }],
    fields: [
      {
        key: "booking-provider.invoice.title",
        label: "Page title",
        defaultValue: "Complete job & invoice",
        style: "title",
      },
      {
        key: "booking-provider.invoice.submitted-title",
        label: "Submitted state title",
        defaultValue: "Invoice submitted",
        style: "success",
      },
      {
        key: "booking-provider.invoice.billable-label",
        label: "Billable time row",
        defaultValue: "Billable time",
        style: "label",
      },
      {
        key: "booking-provider.invoice.total-label",
        label: "Invoice total row",
        defaultValue: "Invoice total",
        style: "label",
      },
      {
        key: "booking-provider.invoice.payout-label",
        label: "Payout row",
        defaultValue: "Your payout",
        style: "label",
      },
      {
        key: "booking-provider.invoice.waiting",
        label: "Customer review explanation",
        defaultValue:
          "The customer has {invoice_hours} hours to confirm; otherwise the saved card is charged automatically.",
        style: "callout",
      },
      {
        key: "booking-provider.invoice.arrival-required",
        label: "Arrival required explanation",
        defaultValue:
          "Mark yourself arrived from Jobs before submitting the invoice.",
        style: "warning",
      },
      {
        key: "booking-provider.invoice.not-ready",
        label: "Not-ready explanation",
        defaultValue: "This job isn't ready to invoice.",
        style: "muted",
      },
      {
        key: "booking-provider.invoice.overage-placeholder",
        label: "Overage explanation placeholder",
        defaultValue:
          "For example: The yard was larger than described and needed a second pass.",
        style: "placeholder",
      },
      {
        key: "booking-provider.invoice.submit",
        label: "Submit invoice button",
        defaultValue: "Submit job complete & invoice",
        style: "button",
      },
      {
        key: "booking-provider.invoice.cash-submit",
        label: "Cash settlement button",
        defaultValue: "Confirm cash payment & finish",
        style: "button",
      },
    ],
  },
] as const satisfies readonly BookingCopyScreen[];

export type BookingCopyKey =
  (typeof BOOKING_COPY_SCREENS)[number]["fields"][number]["key"];

export type BookingCopyOverrides = Partial<Record<BookingCopyKey, string>>;

export const BOOKING_COPY_FIELDS = BOOKING_COPY_SCREENS.flatMap((screen) =>
  screen.fields.map((field) => ({
    ...field,
    perspective: screen.perspective,
    screenId: screen.id,
    livePaths: screen.livePaths,
  })),
);

export const BOOKING_COPY_BY_KEY = Object.fromEntries(
  BOOKING_COPY_FIELDS.map((field) => [field.key, field]),
) as Readonly<
  Record<
    BookingCopyKey,
    (typeof BOOKING_COPY_FIELDS)[number]
  >
>;

const TOKEN_PATTERN = /\{([a-z0-9_]+)\}/g;

export function bookingCopyTokens(value: string): string[] {
  return Array.from(value.matchAll(TOKEN_PATTERN), (match) => match[1]).sort();
}

export function validateBookingCopyValue(
  key: string,
  value: string,
): { ok: true; key: BookingCopyKey; value: string } | { ok: false; error: string } {
  const definition = BOOKING_COPY_BY_KEY[key as BookingCopyKey];
  if (!definition) return { ok: false, error: "Unknown booking copy field" };

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4000) {
    return { ok: false, error: "Text must be 1–4000 characters" };
  }

  const required = bookingCopyTokens(definition.defaultValue);
  const received = bookingCopyTokens(trimmed);
  if (
    required.length !== received.length ||
    required.some((token, index) => token !== received[index])
  ) {
    const list = required.map((token) => `{${token}}`).join(", ");
    return {
      ok: false,
      error: list
        ? `Keep these locked placeholders exactly once: ${list}`
        : "This field does not accept placeholders",
    };
  }

  return { ok: true, key: definition.key as BookingCopyKey, value: trimmed };
}

export function bookingCopyValue(
  overrides: BookingCopyOverrides,
  key: BookingCopyKey,
  values: Record<string, string | number> = {},
): string {
  const definition = BOOKING_COPY_BY_KEY[key];
  const candidate = overrides[key] ?? definition.defaultValue;
  const validated = validateBookingCopyValue(key, candidate);
  const template = validated.ok ? validated.value : definition.defaultValue;

  return template.replace(TOKEN_PATTERN, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token,
  );
}

export function defaultBookingCopy(
  perspective?: BookingCopyPerspective,
): BookingCopyOverrides {
  return Object.fromEntries(
    BOOKING_COPY_FIELDS.filter(
      (field) => !perspective || field.perspective === perspective,
    ).map((field) => [field.key, field.defaultValue]),
  ) as BookingCopyOverrides;
}
