export = NodeNuget;
declare class NodeNuget {
    static setApiKey(key: any, callback: any): void;
    static pack(file: any, callback: any): void;
    static push(file: any, callback: any): any;
}
