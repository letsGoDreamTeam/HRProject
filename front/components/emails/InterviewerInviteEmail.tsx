import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type InterviewerInviteEmailProps = {
  content: string;
  inviteUrl: string;
  expiresAt?: string | null;
  previewText?: string;
};

const bodyStyle = {
  backgroundColor: "#f4f4f5",
  color: "#18181b",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: "0",
  padding: "24px 0",
};

const containerStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "16px",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "32px",
};

const buttonStyle = {
  backgroundColor: "#18181b",
  borderRadius: "10px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "600",
  padding: "14px 24px",
  textDecoration: "none",
};

const mutedTextStyle = {
  color: "#52525b",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
};

export default function InterviewerInviteEmail({
  content,
  inviteUrl,
  expiresAt,
  previewText,
}: InterviewerInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText ?? "Your interview invitation is ready."}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading
            as="h1"
            style={{
              fontSize: "24px",
              lineHeight: "32px",
              margin: "0 0 20px",
            }}
          >
            Interview Invitation
          </Heading>

          <Text
            style={{
              fontSize: "16px",
              lineHeight: "28px",
              margin: "0",
              whiteSpace: "pre-line",
            }}
          >
            {content}
          </Text>

          <Section style={{ margin: "28px 0" }}>
            <Button href={inviteUrl} style={buttonStyle}>
              Open Invitation
            </Button>
          </Section>

          <Text style={mutedTextStyle}>
            If the button does not open, copy and paste this link into your browser.
          </Text>
          <Text
            style={{
              color: "#2563eb",
              fontSize: "14px",
              lineHeight: "22px",
              margin: "12px 0 0",
              wordBreak: "break-all",
            }}
          >
            {inviteUrl}
          </Text>

          {expiresAt ? (
            <>
              <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
              <Text style={mutedTextStyle}>Expires at: {expiresAt}</Text>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
