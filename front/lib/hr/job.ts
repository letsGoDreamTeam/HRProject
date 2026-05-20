import { CreatePositionRequest, CreatePositionResponse, DeletePositionResponse, Position, UpdatePositionRequest, UpdatePositionResponse } from "@/types/hr";
import { hrApi } from "../api";

/**
 * @description ?덈줈??梨꾩슜 吏곷Т ?앹꽦 API
 * URL: /api/positions
 * Method: POST
 * Headers: api ?몄뒪?댁뒪???명꽣?됲꽣媛 ?좏겙???먮룞 二쇱엯?⑸땲??
 */
export const createPosition = async (
    positionData: CreatePositionRequest
): Promise<CreatePositionResponse> => {
    try {
        // HTTP POST 硫붿꽌?쒕? ?ъ슜?섏뿬 ?곗씠?곕? ?꾩넚?⑸땲??
        const response = await hrApi.post<CreatePositionResponse>(
            '/api/positions',
            positionData
        );
        return response.data;
    } catch (error: any | Error) {
        console.error("?슚 [POST] 吏곷Т ?앹꽦 ?ㅽ뙣! 紐⑹뾽 ?곗씠?곕? 諛섑솚?⑸땲??", error);

        // ?쒕쾭 ?ㅼ슫 ???꾨줎?몄뿏??UI ?뚯뒪?몄슜 媛吏??묐떟 (Fallback)
        return {
            message: "吏곷Т ?앹꽦???꾨즺?섏뿀?듬땲?? (UI ?뚯뒪?몄슜 媛吏??묐떟)",
        };
    }
};

/**
 * [?대씪?댁뼵???꾩슜] 吏곷Т 紐⑸줉 議고쉶 API
 * ?⑸룄: 'use client'媛 ?좎뼵??而댄룷?뚰듃(紐⑤떖, ?쒕∼?ㅼ슫, 踰꾪듉 ?대깽?????먯꽌 ?몄텧
 * URL: /api/positions
 * Method: GET
 */
export const getPositionsClient = async (): Promise<Position[]> => {
    try {
        // ?대씪?댁뼵???명꽣?됲꽣媛 ?먮룞?쇰줈 荑좏궎?먯꽌 ?좏겙??異붿텧??二쇱엯?⑸땲??
        const response = await hrApi.get<Position[]>('/api/positions');
        return response.data;
    } catch (error) {
        console.error("?슚 [GET] 吏곷Т 紐⑸줉 議고쉶 ?ㅽ뙣 (?대씪?댁뼵??:", error);
        throw error;
    }
};

/**
 * @description 吏곷Т ?섏젙 API
 * Method: PATCH
 * URL: /api/positions/{positionId}
 * Params: positionId (Path Variable)
 * Body: { positionName: string }
 */
export const updatePosition = async (
    positionId: number | string,
    data: UpdatePositionRequest
): Promise<UpdatePositionResponse> => {
    try {
        // ?뮕 PATCH 硫붿꽌?쒕? ?ъ슜?섏뿬 ?뱀젙 吏곷Т???대쫫???낅뜲?댄듃?⑸땲??
        const response = await hrApi.patch<UpdatePositionResponse>(
            `/api/positions/${positionId}`,
            data
        );
        return response.data;
    } catch (error: any) {
        console.error(`?슚 [PATCH] 吏곷Т ?섏젙 ?ㅽ뙣 (ID: ${positionId})! 紐⑹뾽 ?곗씠?곕? 諛섑솚?⑸땲??`);

        // ?쒕쾭 ?듭떊 ?ㅽ뙣 ??UI ?먮쫫???좎??섍린 ?꾪븳 媛吏??묐떟 (Fallback)
        return {
            message: "吏곷Т ?섏젙???꾨즺?섏뿀?듬땲?? (UI ?뚯뒪?몄슜 媛吏??묐떟)",
        };
    }
};

/**
 * @description 吏곷Т ??젣 API
 * Method: DELETE
 * URL: /api/positions/{positionId}
 * Headers: api ?몄뒪?댁뒪???명꽣?됲꽣媛 auth-storage 荑좏궎?먯꽌 ?좏겙???먮룞 二쇱엯?⑸땲??
 */
export const deletePosition = async (
    positionId: number | string
): Promise<DeletePositionResponse> => {
    try {
        // ?뮕 ?명꽣?됲꽣媛 荑좏궎?먯꽌 ?좏겙??爰쇰궡 Authorization ?ㅻ뜑瑜??먮룞?쇰줈 梨꾩썙以띾땲??
        const response = await hrApi.delete<DeletePositionResponse>(
            `/api/positions/${positionId}`
        );

        return response.data;
    } catch (error: any) {
        // ?슚 諛깆뿏???쒕쾭媛 爰쇱졇?덇굅???곌껐??????寃쎌슦瑜??꾪븳 紐⑹뾽 泥섎━
        console.error(
            `?슚 [DELETE] 吏곷Т ??젣 ?ㅽ뙣 (ID: ${positionId})! ?뚯뒪?몄슜 ?곗씠?곕? 諛섑솚?⑸땲??`
        );

        // ?깃났??寃껋쿂???묐떟??蹂대궡 UI ?먮쫫???좎??⑸땲??
        return {
            message: "吏곷Т ??젣媛 ?꾨즺?섏뿀?듬땲??(UI ?뚯뒪?몄슜 媛吏??묐떟)",
        };
    }
};
