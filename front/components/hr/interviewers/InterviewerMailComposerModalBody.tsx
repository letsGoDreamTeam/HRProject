"use client";

import HrSuccessBanner from "@/components/hr/shared/HrSuccessBanner";
import TemplateVariablesPreview from "./TemplateVariablesPreview";
import MailTemplateVariableAssignModal from "./mail-composer/MailTemplateVariableAssignModal";
import MailTemplateVariableChips from "./mail-composer/MailTemplateVariableChips";
import {
  MAIL_COMPOSER,
  MailComposerField,
  MailComposerInput,
  MailComposerPanel,
  MailComposerSelect,
  MailComposerTextarea,
} from "./mail-composer/mail-composer-ui";
import type { EmailTemplate } from "@/types/emailTemplate";
import type { HrInterviewer } from "@/types/interviewer";
import type { TemplateVariablePreviewItem } from "./TemplateVariablesPreview";

interface InterviewerMailComposerModalBodyProps {
  inviteUrl: string | null;
  mailSent: boolean;
  inviteReused?: boolean;
  isLoadingTemplates: boolean;
  isApplyingTemplate: boolean;
  selectedTemplateId: number | null;
  expiresInDays: number;
  customVariablesText: string;
  subject: string;
  content: string;
  templates: EmailTemplate[];
  selectedTemplate: EmailTemplate | null;
  templateKeys: string[];
  missingTemplateKeys: string[];
  variablePreviewItems: readonly TemplateVariablePreviewItem[];
  resolvedVariables: Record<string, string | number>;
  assigningVariableKey: string | null;
  interviewer: HrInterviewer;
  allInterviewers: readonly HrInterviewer[];
  onSelectVariableKey: (key: string) => void;
  onCloseVariableAssign: () => void;
  onAssignVariable: (key: string, value: string) => void;
  onAssignVariableWithExtras: (
    key: string,
    value: string,
    extras: Record<string, string>,
  ) => void;
  onFillAllMissingVariables: () => void;
  onTemplateChange: (id: number | null) => void;
  onExpiresChange: (days: number) => void;
  onCustomVariablesChange: (text: string) => void;
  onSubjectChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onApplyTemplate: () => void;
}

export default function InterviewerMailComposerModalBody({
  inviteUrl,
  mailSent,
  inviteReused = false,
  isLoadingTemplates,
  isApplyingTemplate,
  selectedTemplateId,
  expiresInDays,
  customVariablesText,
  subject,
  content,
  templates,
  selectedTemplate,
  templateKeys,
  missingTemplateKeys,
  variablePreviewItems,
  resolvedVariables,
  assigningVariableKey,
  interviewer,
  allInterviewers,
  onSelectVariableKey,
  onCloseVariableAssign,
  onAssignVariable,
  onAssignVariableWithExtras,
  onFillAllMissingVariables,
  onTemplateChange,
  onExpiresChange,
  onCustomVariablesChange,
  onSubjectChange,
  onContentChange,
  onApplyTemplate,
}: InterviewerMailComposerModalBodyProps) {
  const assigningCurrentValue =
    assigningVariableKey != null
      ? String(resolvedVariables[assigningVariableKey] ?? "")
      : "";

  return (
    <>
      <div className={MAIL_COMPOSER.shell}>
        {inviteUrl ? (
          <HrSuccessBanner
            title={
              mailSent
                ? "메일 발송이 완료되었습니다"
                : inviteReused
                  ? "유효한 기존 초대 링크를 불러왔습니다"
                  : "초대 링크가 준비되었습니다"
            }
            description={
              <span className="block break-all font-mono text-xs">
                {inviteUrl}
              </span>
            }
            icon={mailSent ? "check-circle" : "link"}
            tone={mailSent ? "emerald" : "indigo"}
          />
        ) : null}

        <div className={MAIL_COMPOSER.grid}>
          <MailComposerPanel
            icon="cog"
            title="템플릿 · 변수"
            description="변수 칩을 클릭해 값을 넣은 뒤 템플릿을 적용하세요"
            footer={
              <button
                type="button"
                onClick={onApplyTemplate}
                disabled={isApplyingTemplate || !selectedTemplateId}
                className={MAIL_COMPOSER.primaryBtn}
              >
                <i
                  className={`bx ${
                    isApplyingTemplate
                      ? "bx-loader-alt animate-spin"
                      : "bx-brush"
                  } text-lg`}
                />
                템플릿 적용
              </button>
            }
          >
            <MailComposerField label="이메일 템플릿" htmlFor="mail-template">
              <MailComposerSelect
                id="mail-template"
                value={selectedTemplateId ?? ""}
                disabled={isLoadingTemplates}
                onChange={(value) =>
                  onTemplateChange(value ? Number(value) : null)
                }
              >
                <option value="">
                  {isLoadingTemplates
                    ? "템플릿 불러오는 중..."
                    : "템플릿을 선택하세요"}
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </MailComposerSelect>
            </MailComposerField>

            <MailComposerField
              label="링크 유효 기간"
              htmlFor="mail-expires"
              hint="새 링크가 필요할 때만 변경하세요."
            >
              <MailComposerSelect
                id="mail-expires"
                value={expiresInDays}
                onChange={(value) => onExpiresChange(Number(value))}
              >
                {[3, 5, 7, 14, 30].map((day) => (
                  <option key={day} value={day}>
                    {day}일
                  </option>
                ))}
              </MailComposerSelect>
            </MailComposerField>

            <div className={MAIL_COMPOSER.card}>
              <p className={MAIL_COMPOSER.label}>선택된 템플릿</p>
              <p className="mt-2 text-sm font-black text-slate-900">
                {selectedTemplate?.subject ?? "선택된 템플릿이 없습니다."}
              </p>
              <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm font-medium leading-6 text-slate-500">
                {selectedTemplate?.body ?? "본문 미리보기가 여기에 표시됩니다."}
              </p>

              <MailTemplateVariableChips
                keys={templateKeys}
                missingKeys={missingTemplateKeys}
                resolvedValues={resolvedVariables}
                onSelectKey={onSelectVariableKey}
              />
            </div>

            {missingTemplateKeys.length > 0 ? (
              <div className="space-y-2">
                <p className={MAIL_COMPOSER.alert}>
                  비어 있는 변수:{" "}
                  {missingTemplateKeys.map((k) => `{${k}}`).join(", ")}
                </p>
                <button
                  type="button"
                  onClick={onFillAllMissingVariables}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-black text-indigo-700 transition hover:bg-indigo-50"
                >
                  <i className="bx bx-magic-wand text-lg" />
                  자동 채울 수 있는 변수 한 번에 채우기
                </button>
              </div>
            ) : null}

            <TemplateVariablesPreview
              variables={variablePreviewItems}
              onSelectKey={onSelectVariableKey}
            />

            <MailComposerField
              label="추가 변수 JSON"
              htmlFor="mail-vars-json"
              hint="고급 편집용입니다. 변수 칩으로 넣으면 여기에도 자동 반영됩니다."
            >
              <MailComposerTextarea
                id="mail-vars-json"
                mono
                value={customVariablesText}
                onChange={(e) => onCustomVariablesChange(e.target.value)}
                rows={7}
                spellCheck={false}
              />
            </MailComposerField>
          </MailComposerPanel>

          <MailComposerPanel
            icon="edit"
            title="메일 작성"
            description="제목·본문을 확인한 뒤 발송하세요"
          >
            <MailComposerField label="메일 제목" htmlFor="mail-subject">
              <MailComposerInput
                id="mail-subject"
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder="[회사명] 면접관 초대 안내"
              />
            </MailComposerField>

            <MailComposerField label="메일 본문" htmlFor="mail-body">
              <MailComposerTextarea
                id="mail-body"
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                rows={16}
                className="min-h-[280px] leading-6"
              />
            </MailComposerField>

            <div className={MAIL_COMPOSER.tip}>
              <p>
                <strong className="font-black">노란색 변수</strong>는 값이 비어
                있습니다. 클릭해 입력하거나 「자동 채우기」를 사용하세요.
              </p>
              <p className="mt-2">
                <strong className="font-black">초록색 변수</strong>는 값이
                채워진 상태입니다. 클릭하면 수정할 수 있습니다.
              </p>
            </div>
          </MailComposerPanel>
        </div>
      </div>

      <MailTemplateVariableAssignModal
        isOpen={assigningVariableKey != null}
        onClose={onCloseVariableAssign}
        variableKey={assigningVariableKey}
        currentValue={assigningCurrentValue}
        inviteUrl={inviteUrl}
        interviewer={interviewer}
        allInterviewers={allInterviewers}
        onSave={onAssignVariable}
        onSaveWithExtras={onAssignVariableWithExtras}
      />
    </>
  );
}
