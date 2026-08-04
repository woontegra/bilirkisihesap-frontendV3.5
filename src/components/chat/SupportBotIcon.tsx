import type { ImgHTMLAttributes } from "react";

type SupportBotIconProps = ImgHTMLAttributes<HTMLImageElement> & {
  size?: number;
};

/** Canlı destek robot ikonu — mavi daire + kulaklıklı asistan */
export function SupportBotIcon({ size = 48, className, alt = "", ...props }: SupportBotIconProps) {
  return (
    <img
      src="/live-chat-icon.png"
      alt={alt}
      width={size}
      height={size}
      className={className}
      draggable={false}
      {...props}
    />
  );
}
