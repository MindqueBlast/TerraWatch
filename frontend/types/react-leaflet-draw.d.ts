declare module 'react-leaflet-draw' {
  import { Component } from 'react';
  
  export interface EditControlProps {
    onEdited?: (e: any) => void;
    onDrawStart?: (e: any) => void;
    onDrawStop?: (e: any) => void;
    onDrawVertex?: (e: any) => void;
    onEditStart?: (e: any) => void;
    onEditMove?: (e: any) => void;
    onEditResize?: (e: any) => void;
    onEditVertex?: (e: any) => void;
    onEditStop?: (e: any) => void;
    onDeleted?: (e: any) => void;
    onDeleteStart?: (e: any) => void;
    onDeleteStop?: (e: any) => void;
    onCreated?: (e: any) => void;
    onMounted?: (e: any) => void;
    draw?: any;
    position?: string;
    edit?: any;
  }
  
  export class EditControl extends Component<EditControlProps, any> {}
}
