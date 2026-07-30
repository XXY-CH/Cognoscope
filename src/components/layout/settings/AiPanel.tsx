/**
 * AiPanel - 设置 · AI（连接参数 + 回答偏好）
 * 所属：AppShell > SettingsDrawer
 * 规范参考：UI_spec.md §2.4；暂不发起网络请求
 */
import { Input } from '../../common';
import type {
  AiAnswerLanguage,
  AiSettingsDraft,
} from '../../../stores/uiStore';
import styles from './SettingsForm.module.css';

export interface AiPanelProps {
  draft: AiSettingsDraft;
  onChange: (patch: Partial<AiSettingsDraft>) => void;
}

const LANG_OPTIONS: { value: AiAnswerLanguage; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: '跟随原文' },
];

/** AiPanel - 连接参数草稿，由抽屉「保存」写入 uiStore */
export function AiPanel({ draft, onChange }: AiPanelProps) {
  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        对接 OpenAI 兼容接口。连接参数与回答偏好均仅保存在本机。
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="settings-ai-api-key">
          API Key
        </label>
        <Input
          id="settings-ai-api-key"
          type="password"
          autoComplete="off"
          placeholder="sk-..."
          aria-label="AI API Key"
          value={draft.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="settings-ai-base-url">
          API Base URL
        </label>
        <Input
          id="settings-ai-base-url"
          type="url"
          autoComplete="off"
          placeholder="https://api.openai.com/v1"
          aria-label="AI API Base URL"
          value={draft.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
        />
        <p className={styles.hint}>
          官方或兼容网关的根路径（含 /v1）。第三方中转请填写其文档中的地址。
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="settings-ai-model">
          模型名称
        </label>
        <Input
          id="settings-ai-model"
          type="text"
          autoComplete="off"
          placeholder="gpt-4o-mini"
          aria-label="AI 模型名称"
          value={draft.model}
          onChange={(e) => onChange({ model: e.target.value })}
        />
        <p className={styles.hint}>
          如 gpt-4o-mini、deepseek-chat 等，以服务商支持的 model id 为准。
        </p>
      </div>

      <div className={styles.field}>
        <p className={styles.label} id="settings-ai-lang-label">
          回答语言
        </p>
        <div
          className={styles.segmented}
          role="group"
          aria-labelledby="settings-ai-lang-label"
        >
          {LANG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={[
                styles.segment,
                draft.answerLanguage === opt.value ? styles.segmentActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={draft.answerLanguage === opt.value}
              onClick={() => onChange({ answerLanguage: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.row}>
          <div>
            <p className={styles.label} id="settings-ai-cite-label">
              自动引用原文
            </p>
            <p className={styles.hint}>
              回答时尽量附带可跳转的原文引用块
            </p>
          </div>
          <button
            type="button"
            className={[styles.toggle, draft.autoCite ? styles.toggleOn : '']
              .filter(Boolean)
              .join(' ')}
            role="switch"
            aria-checked={draft.autoCite}
            aria-labelledby="settings-ai-cite-label"
            onClick={() => onChange({ autoCite: !draft.autoCite })}
          >
            <span className={styles.toggleKnob} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="settings-ai-temperature">
          温度（{draft.temperature.toFixed(1)}）
        </label>
        <Input
          id="settings-ai-temperature"
          type="number"
          min={0}
          max={2}
          step={0.1}
          aria-label="AI 采样温度"
          value={String(draft.temperature)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange({ temperature: n });
          }}
        />
        <p className={styles.hint}>0 更确定，2 更发散；默认 0.7。</p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="settings-ai-max-tokens">
          最大 Token
        </label>
        <Input
          id="settings-ai-max-tokens"
          type="number"
          min={256}
          max={128000}
          step={256}
          aria-label="AI 最大 Token"
          value={String(draft.maxTokens)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange({ maxTokens: n });
          }}
        />
        <p className={styles.hint}>单次回答上限；过大可能被服务商截断。</p>
      </div>
    </div>
  );
}
