import React, { useEffect, useRef } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';


function MapComponent({ layerType,isLayerVisible,layersVisibility  }) { 
  console.log(`Sending: ${layerType}`);



  const layerTypeRef = useRef(layerType);
  const layerRefs = {};


  useEffect(() => {
    layerTypeRef.current = layerType;
  }, [layerType]);


  const api_url = "http://127.0.0.1:5000/";
  const mapRef = useRef(null);  
  const drawRef = useRef(null);
  const geojsonLayerRef = useRef(); 


  useEffect(() => {
    loadMap("map", ol.proj.transform([-77.0197, 2.7738], 'EPSG:4326', 'EPSG:3857'), 8);

  }, []);
  useEffect(() => {

  fetch('http://127.0.0.1:5000/process_geojson')
  .then(response => response.json())
  .then(geojsonData => {
    console.log('Datos GeoJSON recibidos:', geojsonData);

    // Crear una fuente vectorial con los datos GeoJSON
    const vectorSource = new ol.source.Vector({
      features: new ol.format.GeoJSON().readFeatures(geojsonData, {
        dataProjection: 'EPSG:4326',  
        featureProjection: 'EPSG:3857' // Proyección del mapa
      })
    });

    // Crear una capa vectorial con la fuente
    const vectorLayer = new ol.layer.Vector({
      source: vectorSource,
      id: 'geojson-layer',
      visible: isLayerVisible // Usar isLayerVisible para establecer la visibilidad inicial


    });

    // Agregar la capa al mapa
    mapRef.current.addLayer(vectorLayer);
  })
  .catch(error => {
    console.error('Error al cargar los datos GeoJSON:', error);
  });
}, []);

useEffect(() => {
  if (mapRef.current && mapRef.current.getLayers()) {
    const geojsonLayer = mapRef.current.getLayers().getArray()
      .find(layer => layer.get('id') === 'geojson-layer');

    if (geojsonLayer) {
      geojsonLayer.setVisible(isLayerVisible);
      console.log("Visibilidad de la capa GeoJSON:", isLayerVisible);
    }
  }
}, [isLayerVisible]);

  function loadMap(target, center, zoom) {
    const raster = new ol.layer.Tile({
      source: new ol.source.OSM()
    });
    mapRef.current = new ol.Map({
      layers: [raster],
      target: target,
      view: new ol.View({
          center: center,
          zoom: zoom
      })
    });

    // Agregar funcionalidad de dibujo
    addDrawFunctionality(mapRef.current);
  }

  function addDrawFunctionality(map) {
    const source = new ol.source.Vector({wrapX: false});
    const vector = new ol.layer.Vector({
      source: source
    });
    map.addLayer(vector);

    const draw = new ol.interaction.Draw({
      source: source,
      type: 'Polygon',
      contrast: 0.2
    });

    drawRef.current = draw;
    map.addInteraction(draw);

    draw.on('drawend', (event) => {
      const coordinates = event.feature.getGeometry().getCoordinates();
      const transformedCoords = coordinates[0].map(coord => ol.proj.transform(coord, 'EPSG:3857', 'EPSG:4326'));
      
      // Llamar a la función con las coordenadas y el tipo de capa actual
      sendPolygonToServer(transformedCoords);
    });
  }
  let layerCounter = 0; // Esto debería estar definido en el ámbito adecuado para que persista entre llamadas

  function sendPolygonToServer(coordinates) {
    let endpoint;

    // Determinar el endpoint basado en layerTypeRef.current
    if (layerTypeRef.current === 'coords') {
        endpoint = "coords";
    } else if (layerTypeRef.current === 'precipitation') {
        endpoint = "precipitation";
    } else if (layerTypeRef.current === 'prueba') {
        endpoint = "prueba"; // Nuevo endpoint añadido
    } else {
        //  definir un endpoint por defecto o manejar un caso no esperado
        console.error("Tipo de capa desconocido:", layerTypeRef.current);
        return; // Salir de la función si el tipo de capa no es reconocido
    }

    console.log(`Sending to endpoint: ${endpoint}`);
    console.log(`Coordinates being sent:`, coordinates);
    fetch(api_url + endpoint, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ coordinates: coordinates })
    })
    .then(response => response.json())
    .then(data => {
      
      if (data.url) { // Si la respuesta incluye una URL, se asume que es para una capa de teselas
          addTileServerURL(data.url, endpoint);
      } else if (data.type === "FeatureCollection") { // Si la respuesta es un objeto GeoJSON
          // Convertir el GeoJSON en una fuente de datos para OpenLayers
          var vectorSource = new ol.source.Vector({
              features: new ol.format.GeoJSON().readFeatures(data, {
                  dataProjection: 'EPSG:4326', 
                  featureProjection: 'EPSG:3857' // Proyección usada por OpenLayers por defecto
              })
          });

          // Crear una capa vectorial usando la fuente de datos
          var vectorLayer = new ol.layer.Vector({
              source: vectorSource,
              id:endpoint

          });

          // Añadir la capa vectorial al mapa
          mapRef.current.addLayer(vectorLayer);
      } else {
          console.error('Formato de respuesta no reconocido:', data);
      }
  })
  .catch(error => {
      console.error('There was a problem with the fetch operation:', error);
  });
}
  function addTileServerURL(url, layerID) {
    if (typeof url !== "string") {
      console.error("Invalid URL type:", typeof url);
      return;
    }
    var geeLayer = new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: url
      }),

      opacity: 0.7
    });
    const uniqueLayerID = `${layerID}-${Date.now()}`; // Agrega un identificador único
    geeLayer.set('id', uniqueLayerID);  // Establecer el ID de esta manera
    console.log("Creando capa con ID:", uniqueLayerID, geeLayer);

    mapRef.current.addLayer(geeLayer);
    
  }

  function setLayerVisibilityByOption(option, isVisible) {
    const layers = mapRef.current.getLayers().getArray();
    layers.forEach(layer => {
      const layerID = layer.get('id');
      if (layerID && layerID.startsWith(option)) {
        layer.setVisible(isVisible);
        console.log(`Visibilidad actualizada para todas las capas de ${option}: ${isVisible}`);
      }
    });
  }

  useEffect(() => {
    if (layersVisibility) {
      Object.keys(layersVisibility).forEach(option => {
        console.log(`Actualizando visibilidad para ${option}: ${layersVisibility[option]}`);
        setLayerVisibilityByOption(option, layersVisibility[option]);
      });
    }
  }, [layersVisibility]);
  
  // Agregar un selector para el tipo de capa antes del mapa
  return (
    <>
      
      <div id="map" style={{ width: '100%', height: '400px' }}></div>
    </>
  );
}

export default MapComponent;