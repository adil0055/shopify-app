// Type declarations for Shopify Admin UI Extension components

declare namespace JSX {
    interface IntrinsicElements {
        's-admin-block': any;
        's-banner': any;
        's-button': any;
        's-checkbox': any;
        's-image': any;
        's-pressable': any;
        's-spinner': any;
        's-stack': any;
        's-text': any;
        's-view': any;
    }
}

// Shopify global object
declare global {
    interface Window {
        shopify: {
            auth: {
                sessionToken: {
                    get(): Promise<string>;
                };
            };
            data: {
                selected?: Array<{
                    id: string;
                    [key: string]: any;
                }>;
                [key: string]: any;
            };
        };
    }


}

export { };
