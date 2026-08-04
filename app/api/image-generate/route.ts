import { assertSameOrigin, requireUser } from "@/lib/auth";
import { appEnv } from "@/lib/db";
import {
  imageModelConfigForUser,
  imageEndpoint,
  imageHeaders,
} from "@/lib/image-model-config";
import { recordTokenUsage, type ProviderUsage } from "@/lib/token-usage";
function sizeFor(text: string, index: number) {
  const row =
    text
      .split(/\r?\n/)
      .find((line) =>
        new RegExp(`(^|\\D)${index}([.)、：:]|\\D)`).test(line),
      ) ?? "";
  if (/600\s*[×x*]\s*450|mobile|手机版/i.test(row)) return "600x450";
  if (/1464\s*[×x*]\s*600|a\+|desktop|电脑版/i.test(row)) return "1464x600";
  return "1600x1600";
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const form = await request.formData();
    const prompt = String(form.get("prompt") ?? "").trim();
    const file = form.get("requirements");
    if (!prompt || !(file instanceof File))
      return Response.json(
        { error: "请填写生图 Prompt 并上传图片需求表" },
        { status: 400 },
      );
    const requirements = await file.text();
    const config = await imageModelConfigForUser(user.id);
    const jobId = crypto.randomUUID();
    const images: Array<{ index: number; size: string; objectKey: string }> =
      [];
    for (let index = 1; index <= 7; index++) {
      const size = sizeFor(requirements, index);
      const requestBody = {
        model: config.modelName,
        prompt: `${prompt}\n\nImage ${index} requirements:\n${requirements}`,
        size,
        n: 1,
        response_format: "b64_json",
      };
      const response = await fetch(imageEndpoint(config), {
        method: "POST",
        headers: imageHeaders(config),
        body: JSON.stringify(requestBody),
      });
      if (!response.ok)
        throw new Error(`第 ${index} 张图片生成失败 (${response.status})`);
      const data = (await response.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
        usage?: ProviderUsage;
      };
      const item = data.data?.[0];
      if (!item) throw new Error(`第 ${index} 张图片没有返回图像`);
      await recordTokenUsage({
        userId: user.id,
        modelName: config.modelName,
        modelSource: "image",
        operation: "image.generate",
        usage: data.usage,
        request: requestBody,
        response: "",
      });
      let bytes: ArrayBuffer;
      if (item.b64_json) {
        const binary = atob(item.b64_json);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        bytes = array.buffer;
      } else if (item.url) {
        const image = await fetch(item.url);
        if (!image.ok) throw new Error(`第 ${index} 张图片下载失败`);
        bytes = await image.arrayBuffer();
      } else throw new Error(`第 ${index} 张图片返回格式无法识别`);
      const objectKey = `generated-images/${user.id}/${jobId}/${index}.png`;
      await appEnv().FILES?.put(objectKey, bytes, {
        httpMetadata: { contentType: "image/png" },
        customMetadata: { userId: user.id, jobId, index: String(index), size },
      });
      images.push({ index, size, objectKey });
    }
    return Response.json({
      jobId,
      images: images.map((image) => ({
        ...image,
        downloadUrl: `/api/image-download?jobId=${jobId}&index=${image.index}`,
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "生图失败" },
      { status: 400 },
    );
  }
}
