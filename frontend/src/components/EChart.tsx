// Wrapper Apache ECharts – tự dispose khi unmount, tự resize theo container.
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts } from 'echarts/core';
import type { EChartsOption } from 'echarts';

echarts.use([
  PieChart,
  BarChart,
  LineChart,
  CustomChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

interface EChartProps {
  option: EChartsOption;
  height?: number;
}

export default function EChart({ option, height = 300 }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
