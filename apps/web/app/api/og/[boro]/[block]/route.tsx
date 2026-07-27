import { ImageResponse } from "@vercel/og";
import {
  buildShareCardModel,
  type ShareCardPayload,
} from "../../../../../lib/share/cardModel";
import {
  CARD_TOKENS,
  RECEIPT_TOKENS,
} from "../../../../../lib/share/cardTokens";
import {
  CARD_COPY,
  CARD_LAYOUT,
  receiptGeometry,
} from "../../../../../lib/share/cardLayout";
import {
  loadBlockForOg,
  normalizedBorough,
  silhouetteBars,
  topGroupValues,
  type OgBlockPayload,
} from "./ogModel";

export const runtime = "edge";

const CACHE_CONTROL = "public, immutable, max-age=31536000";

type RouteContext = {
  params: Promise<{ boro: string; block: string }>;
};

function genericModel() {
  return {
    where: "NEW YORK CITY · FY2027",
    subline: "ASSESSMENT ROLL NOTICE",
    dollars: "parcel not on file",
    rank: "Search another borough and block",
    quip: "The requested block does not appear in this assessment roll.",
    addressedLot: null,
    stamp: "PD-NYC-FY27",
    source: "DOF assessed market value · not sale price · nyc.gov/finance",
  };
}

function receiptModel(payload: OgBlockPayload | null) {
  return payload
    ? buildShareCardModel(payload as ShareCardPayload)
    : genericModel();
}

function OgCard({ payload }: { payload: OgBlockPayload | null }) {
  const model = receiptModel(payload);
  const geometry = receiptGeometry(Boolean(model.addressedLot));
  const receipt = CARD_LAYOUT.receipt;
  const values = payload
    ? topGroupValues(payload)
    : [9, 5, 14, 7, 20, 11, 4, 8];
  const bars = silhouetteBars(values);

  return (
    <div
      style={{
        display: "flex",
        width: `${CARD_LAYOUT.width}px`,
        height: `${CARD_LAYOUT.height}px`,
        background: CARD_TOKENS.void,
        color: CARD_TOKENS.ink,
        fontFamily: CARD_TOKENS.font,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: `${CARD_LAYOUT.skylineWidth}px`,
          height: `${CARD_LAYOUT.height}px`,
          alignItems: "flex-end",
          padding: "70px 48px 70px",
          background: RECEIPT_TOKENS.skylineGround,
          overflow: "hidden",
        }}
      >
        <svg
          width="560"
          height="430"
          viewBox="0 0 560 430"
          aria-label="Assessed-value skyline"
        >
          <rect
            x="0"
            y="426"
            width="560"
            height="4"
            fill={CARD_TOKENS.inkDim}
            opacity="0.45"
          />
          {bars.map((bar, index) => (
            <rect
              key={`${bar.x}-${index}`}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={
                index === 0 ? CARD_TOKENS.gold : RECEIPT_TOKENS.skylineBuilding
              }
              stroke={CARD_TOKENS.inkDim}
              strokeWidth="2"
            />
          ))}
        </svg>
        <div
          style={{
            position: "absolute",
            left: "48px",
            top: "45px",
            display: "flex",
            fontFamily: CARD_TOKENS.num,
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: CARD_TOKENS.inkDim,
          }}
        >
          VALUE SKYLINE · TOP 12 GROUPS
        </div>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          width: `${CARD_LAYOUT.width - CARD_LAYOUT.skylineWidth}px`,
          height: `${CARD_LAYOUT.height}px`,
          flexDirection: "column",
          padding: "36px 38px 24px 42px",
          background: CARD_TOKENS.paper,
          color: CARD_TOKENS.paperInk,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: CARD_TOKENS.num,
            fontSize: "29px",
            fontWeight: 800,
          }}
        >
          {CARD_COPY.wordmark}
        </div>
        <div
          style={{
            display: "flex",
            width: "56px",
            height: "4px",
            marginTop: "8px",
            background: CARD_TOKENS.stamp,
          }}
        />

        <div
          style={{
            display: "flex",
            marginTop: "24px",
            fontSize: "21px",
            fontWeight: 600,
          }}
        >
          {model.where}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "7px",
            color: RECEIPT_TOKENS.mutedInk,
            fontSize: "16px",
          }}
        >
          {model.subline}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "28px",
            fontFamily: CARD_TOKENS.num,
            fontSize: model.dollars.length > 13 ? "62px" : "82px",
            fontWeight: 800,
            lineHeight: 0.9,
            letterSpacing: "-0.02em",
          }}
        >
          {model.dollars}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "14px",
            color: CARD_TOKENS.stamp,
            fontFamily: CARD_TOKENS.num,
            fontSize: "27px",
            fontWeight: 700,
          }}
        >
          {model.rank}
        </div>

        <div
          style={{
            display: "flex",
            height: "1px",
            marginTop: "20px",
            background: RECEIPT_TOKENS.rule,
          }}
        />
        <div
          style={{
            display: "flex",
            height: "64px",
            marginTop: "18px",
            overflow: "hidden",
            color: RECEIPT_TOKENS.bodyInk,
            fontSize: "19px",
            lineHeight: 1.45,
          }}
        >
          {model.quip}
        </div>

        {model.addressedLot ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "5px",
            }}
          >
            <div
              style={{
                display: "flex",
                color: RECEIPT_TOKENS.mutedInk,
                fontFamily: CARD_TOKENS.num,
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              {CARD_COPY.addressedLot}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: "4px",
                fontFamily: CARD_TOKENS.num,
                fontSize: "22px",
                fontWeight: 700,
              }}
            >
              {model.addressedLot}
            </div>
          </div>
        ) : null}

        <div
          style={{
            position: "absolute",
            left: "42px",
            top: `${geometry.stampY}px`,
            display: "flex",
            minWidth: `${receipt.stampWidth}px`,
            height: `${receipt.stampHeight}px`,
            alignItems: "center",
            justifyContent: "center",
            border: `2px solid ${CARD_TOKENS.stamp}`,
            color: CARD_TOKENS.stamp,
            fontFamily: CARD_TOKENS.num,
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "0.1em",
          }}
        >
          {model.stamp}
        </div>
        <div
          style={{
            position: "absolute",
            left: "42px",
            bottom: "19px",
            display: "flex",
            color: RECEIPT_TOKENS.mutedInk,
            fontSize: "12px",
          }}
        >
          {model.source}
        </div>
      </div>
    </div>
  );
}

export async function GET(request: Request, context: RouteContext) {
  const params = await context.params;
  const borough = normalizedBorough(params.boro);
  const block = Number(params.block);
  const validBlock = Number.isSafeInteger(block) && block >= 0;
  const payload =
    borough && validBlock
      ? await loadBlockForOg(new URL(request.url).origin, borough, block)
      : null;

  return new ImageResponse(<OgCard payload={payload} />, {
    width: CARD_LAYOUT.width,
    height: CARD_LAYOUT.height,
    status: payload ? 200 : 404,
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}
